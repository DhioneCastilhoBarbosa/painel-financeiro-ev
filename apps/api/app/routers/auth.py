import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from jwt.exceptions import InvalidTokenError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import CurrentUser
from app.core.ratelimit import limiter
from app.core.redis import get_redis
from app.core.security import (
    create_access_token,
    create_email_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.custom_role import CustomRole
from app.models.organization import Organization
from app.models.subscription import Subscription, SubscriptionPlan, SubscriptionStatus
from app.models.user import User, UserRole
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UpdateProfileRequest,
    UserResponse,
    VerifyEmailRequest,
)
from app.services.permissions import resolve_permissions

router = APIRouter()

REFRESH_TOKEN_PREFIX = "refresh:"
RESET_TOKEN_PREFIX = "reset:"

_REFRESH_COOKIE_MAX_AGE = 30 * 24 * 3600


def _set_refresh_cookie(response: Response, token: str) -> None:
    """HttpOnly refresh cookie — Secure apenas quando APP_URL é https://."""
    response.set_cookie(
        key="refresh_token",
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=_REFRESH_COOKIE_MAX_AGE,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key="refresh_token",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def _slug_from_name(name: str) -> str:
    import re

    slug = re.sub(r"[^a-z0-9]+", "-", name.lower().strip()).strip("-")
    return slug[:80] + "-" + secrets.token_hex(4)


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    summary="Criar conta",
    description=(
        "Cria uma nova organização e o primeiro usuário como **proprietário** (owner). "
        "A organização inicia com **14 dias de trial gratuito**. "
        "Um e-mail de verificação é enviado automaticamente — o link expira em 1 hora. "
        "\n\n**Rate limit:** 5 requisições/minuto por IP."
    ),
    responses={
        201: {"description": "Conta criada. E-mail de verificação enviado."},
        409: {"description": "E-mail já cadastrado"},
        422: {"description": "Dados inválidos (e-mail, senha curta, campos obrigatórios)"},
        429: {"description": "Muitas tentativas — aguarde 1 minuto"},
    },
)
@limiter.limit("5/minute")
async def register(request: Request, body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.scalar(select(User).where(User.email == body.email))
    if existing:
        raise HTTPException(status_code=409, detail="E-mail já cadastrado")

    # Protege o nome reservado "Intelbras" e garante unicidade de nome
    if body.organization_name.strip().lower() == "intelbras":
        raise HTTPException(
            status_code=400,
            detail="O nome 'Intelbras' é reservado. Para ingressar nesta organização, solicite um convite.",
        )
    name_taken = await db.scalar(
        select(Organization).where(Organization.name == body.organization_name)
    )
    if name_taken:
        raise HTTPException(
            status_code=409, detail="Já existe uma organização com esse nome. Escolha outro."
        )

    org = Organization(
        id=uuid.uuid4(),
        name=body.organization_name,
        slug=_slug_from_name(body.organization_name),
        plan="trial",
        status="active",
        trial_ends_at=datetime.now(UTC) + timedelta(days=14),
    )
    db.add(org)
    await db.flush()

    user = User(
        id=uuid.uuid4(),
        organization_id=org.id,
        email=body.email,
        password_hash=hash_password(body.password),
        name=body.name,
        role=UserRole.owner,
    )
    db.add(user)

    subscription = Subscription(
        id=uuid.uuid4(),
        organization_id=org.id,
        plan=SubscriptionPlan.trial,
        status=SubscriptionStatus.trialing,
        current_period_end=org.trial_ends_at,
    )
    db.add(subscription)
    await db.flush()

    # Envia e-mail de verificação (token com 1h de validade)
    verify_token = create_email_token(body.email, "verify")
    redis = get_redis()
    await redis.setex(f"verify:{verify_token}", 3600, str(user.id))

    from app.services.email import send_verify_email

    await send_verify_email(body.email, body.name, verify_token)

    return {"message": "Cadastro realizado. Verifique seu e-mail para ativar a conta."}


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login — obter access token",
    description=(
        "Autentica o usuário e retorna um **access token JWT** (válido por 15 min) no corpo da resposta "
        "e um **refresh token** como cookie `HttpOnly` (válido por 30 dias). "
        "\n\nO access token deve ser enviado no header `Authorization: Bearer <token>` em todas as "
        "requisições autenticadas. Use `/refresh` para renovar sem re-login."
        "\n\n**Rate limit:** 10 requisições/minuto por IP."
    ),
    responses={
        200: {
            "description": "Login realizado. Access token retornado no corpo, refresh token em cookie."
        },
        401: {"description": "Credenciais inválidas"},
        403: {"description": "Conta desativada"},
        429: {"description": "Muitas tentativas — aguarde 1 minuto"},
    },
)
@limiter.limit("10/minute")
async def login(
    request: Request,
    body: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    user = await db.scalar(select(User).where(User.email == body.email))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Conta desativada")

    user.last_login_at = datetime.now(UTC)

    access = create_access_token(str(user.id), str(user.organization_id))
    refresh = create_refresh_token(str(user.id))

    redis = get_redis()
    await redis.setex(
        f"{REFRESH_TOKEN_PREFIX}{refresh}",
        30 * 24 * 3600,
        str(user.id),
    )

    _set_refresh_cookie(response, refresh)

    return TokenResponse(access_token=access)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Renovar access token",
    description=(
        "Usa o **refresh token** (cookie `HttpOnly` `refresh_token`) para emitir um novo access token "
        "sem re-autenticação. O refresh token é rotacionado — o anterior é invalidado imediatamente. "
        "\n\nConfigure o cliente HTTP para enviar cookies (`withCredentials: true` no axios)."
    ),
    responses={
        200: {"description": "Novo access token emitido"},
        401: {"description": "Refresh token ausente, inválido ou expirado"},
    },
)
async def refresh_token(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Refresh token ausente")

    redis = get_redis()
    user_id = await redis.get(f"{REFRESH_TOKEN_PREFIX}{token}")
    if not user_id:
        raise HTTPException(status_code=401, detail="Refresh token inválido ou expirado")

    try:
        payload = decode_token(token)
        if payload.get("type") != "refresh":
            raise ValueError()
    except (InvalidTokenError, ValueError) as err:
        raise HTTPException(status_code=401, detail="Token inválido") from err

    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")

    # Rotaciona o refresh token
    await redis.delete(f"{REFRESH_TOKEN_PREFIX}{token}")
    new_refresh = create_refresh_token(str(user.id))
    await redis.setex(f"{REFRESH_TOKEN_PREFIX}{new_refresh}", 30 * 24 * 3600, str(user.id))

    _set_refresh_cookie(response, new_refresh)

    access = create_access_token(str(user.id), str(user.organization_id))
    return TokenResponse(access_token=access)


@router.post(
    "/logout",
    summary="Logout — invalidar refresh token",
    description="Invalida o refresh token no Redis e remove o cookie. O access token continua válido até expirar (15 min).",
    responses={200: {"description": "Logout realizado"}},
)
async def logout(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if token:
        redis = get_redis()
        await redis.delete(f"{REFRESH_TOKEN_PREFIX}{token}")
    _clear_refresh_cookie(response)
    return {"message": "Logout realizado"}


@router.post(
    "/verify-email",
    summary="Verificar e-mail",
    description="Valida o token de verificação enviado por e-mail após o registro. O token expira em 1 hora.",
    responses={
        200: {"description": "E-mail verificado com sucesso"},
        400: {"description": "Token inválido ou expirado"},
    },
)
async def verify_email(body: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    redis = get_redis()
    user_id = await redis.get(f"verify:{body.token}")
    if not user_id:
        raise HTTPException(status_code=400, detail="Token inválido ou expirado")

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    user.email_verified_at = datetime.now(UTC)
    await redis.delete(f"verify:{body.token}")
    return {"message": "E-mail verificado com sucesso"}


@router.post(
    "/forgot-password",
    summary="Solicitar redefinição de senha",
    description=(
        "Envia um link de redefinição de senha ao e-mail informado (se estiver cadastrado). "
        "Retorna sempre a mesma mensagem de sucesso para evitar enumeração de e-mails. "
        "O link expira em **1 hora**. \n\n**Rate limit:** 3 requisições/minuto por IP."
    ),
    responses={200: {"description": "Instruções enviadas (se o e-mail existir)"}},
)
@limiter.limit("3/minute")
async def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    user = await db.scalar(select(User).where(User.email == body.email))
    # Retorna sempre sucesso para não revelar se o e-mail existe
    if user:
        reset_token = create_email_token(body.email, "reset")
        redis = get_redis()
        await redis.setex(f"{RESET_TOKEN_PREFIX}{reset_token}", 3600, str(user.id))
        from app.services.email import send_reset_password_email

        await send_reset_password_email(body.email, user.name, reset_token)

    return {"message": "Se o e-mail estiver cadastrado, você receberá as instruções"}


@router.post(
    "/reset-password",
    summary="Redefinir senha",
    description="Usa o token do e-mail para definir uma nova senha. O token é invalidado após o uso.",
    responses={
        200: {"description": "Senha redefinida com sucesso"},
        400: {"description": "Token inválido, expirado ou já utilizado"},
    },
)
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    redis = get_redis()
    user_id = await redis.get(f"{RESET_TOKEN_PREFIX}{body.token}")
    if not user_id:
        raise HTTPException(status_code=400, detail="Token inválido ou expirado")

    try:
        payload = decode_token(body.token)
        if payload.get("purpose") != "reset":
            raise ValueError()
    except (InvalidTokenError, ValueError) as err:
        raise HTTPException(status_code=400, detail="Token inválido") from err

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    user.password_hash = hash_password(body.new_password)
    await redis.delete(f"{RESET_TOKEN_PREFIX}{body.token}")
    return {"message": "Senha redefinida com sucesso"}


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Perfil do usuário autenticado",
    description=(
        "Retorna os dados do usuário atual: perfil, role, organização e mapa de permissões granulares. "
        "Use este endpoint para descobrir o que o usuário tem acesso no frontend."
    ),
    responses={
        200: {"description": "Perfil completo do usuário"},
        401: {"description": "Token ausente ou inválido"},
    },
)
async def me(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    org = await db.get(Organization, current_user.organization_id)
    custom_role = (
        await db.get(CustomRole, current_user.custom_role_id)
        if current_user.custom_role_id
        else None
    )
    permissions = resolve_permissions(current_user, custom_role)
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        name=current_user.name,
        role=current_user.role,
        organization_id=str(current_user.organization_id),
        organization_name=org.name if org else "",
        organization_is_mother=org.is_mother if org else False,
        email_verified=current_user.email_verified_at is not None,
        is_master=current_user.is_master,
        custom_role_id=str(current_user.custom_role_id) if current_user.custom_role_id else None,
        custom_role_name=custom_role.name if custom_role else None,
        permissions=permissions,
    )


@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UpdateProfileRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, current_user.id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Nome não pode ser vazio")
        user.name = name

    if body.current_password is not None and body.new_password is not None:
        if not verify_password(body.current_password, user.password_hash):
            raise HTTPException(status_code=400, detail="Senha atual incorreta")
        if len(body.new_password) < 8:
            raise HTTPException(
                status_code=400, detail="Nova senha deve ter pelo menos 8 caracteres"
            )
        user.password_hash = hash_password(body.new_password)

    await db.commit()
    await db.refresh(user)
    org = await db.get(Organization, user.organization_id)
    return UserResponse(
        id=str(user.id),
        email=user.email,
        name=user.name,
        role=user.role,
        organization_id=str(user.organization_id),
        organization_name=org.name if org else "",
        organization_is_mother=org.is_mother if org else False,
        email_verified=user.email_verified_at is not None,
        is_master=user.is_master,
    )
