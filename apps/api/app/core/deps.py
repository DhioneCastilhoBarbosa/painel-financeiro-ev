from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token
from app.models.organization import Organization
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.user import User, UserRole

bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token inválido ou expirado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not credentials:
        raise exc
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise exc
        user_id: str = payload["sub"]
    except (InvalidTokenError, KeyError) as err:
        raise exc from err

    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise exc
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def require_active_plan(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Dependency para routers que exigem plano ativo.

    Regras:
    • Trial ativo (trial_ends_at no futuro)  → permitido
    • Plano pago com assinatura ativa         → permitido
    • Trial expirado                          → 402
    • Plano pago mas assinatura cancelada     → 402
    • Plano pago mas pagamento pendente       → 402
    • Plano "free" (após cancelamento)        → 402
    """
    org = await db.get(Organization, current_user.organization_id)
    if not org:
        return  # Organização inválida — não bloqueia (erro de dados)

    now = datetime.now(UTC)

    # ── Trial local ─────────────────────────────────────────────────────────
    if org.plan == "trial":
        if org.trial_ends_at and org.trial_ends_at > now:
            return  # Dentro do período de trial
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "trial_expired",
                "message": "Seu período de trial expirou. Acesse Plano & Cobrança para continuar.",
            },
        )

    # ── Plano free/cancelado ────────────────────────────────────────────────
    if org.plan == "free":
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "no_active_plan",
                "message": "Esta funcionalidade requer um plano ativo. Acesse Plano & Cobrança.",
            },
        )

    # ── Plano pago — verificar status da assinatura Stripe ──────────────────
    sub = await db.scalar(select(Subscription).where(Subscription.organization_id == org.id))
    if sub:
        if sub.status == SubscriptionStatus.active:
            return  # Assinatura paga e ativa
        if sub.status == SubscriptionStatus.trialing:
            return  # Trial gerenciado pelo Stripe
        if sub.status == SubscriptionStatus.past_due:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "code": "payment_past_due",
                    "message": "Pagamento pendente. Regularize sua assinatura para continuar.",
                },
            )
        if sub.status == SubscriptionStatus.canceled:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "code": "subscription_canceled",
                    "message": "Assinatura cancelada. Reative seu plano para continuar.",
                },
            )

    # Plano pago no banco mas sem registro de assinatura — raro, permite
    return


def require_roles(*roles: UserRole):
    async def _check(current_user: CurrentUser) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Permissão insuficiente"
            )
        return current_user

    return Depends(_check)
