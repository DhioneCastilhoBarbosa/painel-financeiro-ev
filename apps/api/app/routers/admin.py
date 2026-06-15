"""
Painel de Administrador — exclusivo para usuários Mestres da organização Intelbras.

Regras de acesso:
  • current_user.is_master = True
  • current_user.organization deve ter is_mother = True (org Intelbras)

Capacidades:
  • Listar / ver detalhes de todas as organizações (tenants)
  • Bloquear / desbloquear organizações
  • Alterar plano de uma organização
  • Listar todos os usuários (cross-tenant)
  • Ver estatísticas globais da plataforma
  • Conceder / revogar cargo de Mestre em qualquer org
"""

from __future__ import annotations

import secrets
import string
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import delete as sql_delete
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.core.plan_config import get_all_plans, get_available_features, update_plan
from app.models.charging_session import ChargingSession
from app.models.data_file import DataFile
from app.models.feedback import Feedback
from app.models.org_invite_code import OrgInviteCode
from app.models.organization import Organization
from app.models.subscription import Subscription
from app.models.user import User
from app.services.audit_service import log_action

router = APIRouter()


# ─── Dependency ───────────────────────────────────────────────────────────────


async def require_intelbras_master(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Exige que o usuário seja Mestre dentro da org mãe (Intelbras)."""
    if not current_user.is_master:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito a usuários Mestres da Intelbras",
        )
    org = await db.get(Organization, current_user.organization_id)
    if not org or not org.is_mother:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito ao painel de administrador da Intelbras",
        )
    return current_user


_AdminUser = Depends(require_intelbras_master)


# ─── Schemas ──────────────────────────────────────────────────────────────────


class OrgStatusUpdate(BaseModel):
    status: str  # active | suspended | blocked
    reason: str | None = None


class OrgPlanUpdate(BaseModel):
    plan: str  # trial | starter | pro | enterprise


class AdminMasterUpdate(BaseModel):
    is_master: bool


class AdminUserStatusUpdate(BaseModel):
    is_active: bool


class InviteCodeCreate(BaseModel):
    validity_days: int = Field(default=7, ge=1, le=365, description="Validade em dias (1-365)")


# ─── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/stats", summary="Estatísticas globais da plataforma")
async def global_stats(
    _: User = _AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    total_orgs = await db.scalar(select(func.count(Organization.id)))
    active_orgs = await db.scalar(
        select(func.count(Organization.id)).where(Organization.status == "active")
    )
    total_users = await db.scalar(select(func.count(User.id)).where(User.is_active.is_(True)))
    total_files = await db.scalar(select(func.count(DataFile.id)))
    total_sessions = await db.scalar(select(func.count(ChargingSession.id)))
    return {
        "organizations": {"total": total_orgs, "active": active_orgs},
        "users": {"total": total_users},
        "files": {"total": total_files},
        "sessions": {"total": total_sessions},
        "generated_at": datetime.now(UTC),
    }


@router.get("/organizations", summary="Listar todas as organizações")
async def list_all_organizations(
    _: User = _AdminUser,
    db: AsyncSession = Depends(get_db),
    search: str | None = Query(None, description="Filtrar por nome"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> list[dict[str, Any]]:
    q = select(Organization).order_by(Organization.created_at.desc())
    if search:
        q = q.where(Organization.name.ilike(f"%{search}%"))
    q = q.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    orgs = result.scalars().all()

    rows = []
    for org in orgs:
        user_count = await db.scalar(
            select(func.count(User.id)).where(
                User.organization_id == org.id, User.is_active.is_(True)
            )
        )
        file_count = await db.scalar(
            select(func.count(DataFile.id)).where(DataFile.organization_id == org.id)
        )
        sub = await db.scalar(select(Subscription).where(Subscription.organization_id == org.id))
        rows.append(
            {
                "id": str(org.id),
                "name": org.name,
                "slug": org.slug,
                "plan": org.plan,
                "status": org.status,
                "is_mother": org.is_mother,
                "created_at": org.created_at,
                "trial_ends_at": org.trial_ends_at,
                "users": user_count or 0,
                "files": file_count or 0,
                "subscription_status": sub.status if sub else None,
            }
        )
    return rows


@router.get("/organizations/{org_id}", summary="Detalhes de uma organização")
async def get_organization_detail(
    org_id: str,
    _: User = _AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")

    users_result = await db.execute(
        select(User).where(User.organization_id == org.id).order_by(User.created_at)
    )
    users = users_result.scalars().all()

    files_result = await db.execute(
        select(DataFile)
        .where(DataFile.organization_id == org.id)
        .order_by(DataFile.created_at.desc())
        .limit(20)
    )
    files = files_result.scalars().all()

    sub = await db.scalar(select(Subscription).where(Subscription.organization_id == org.id))

    return {
        "id": str(org.id),
        "name": org.name,
        "slug": org.slug,
        "plan": org.plan,
        "status": org.status,
        "is_mother": org.is_mother,
        "settings": org.settings,
        "created_at": org.created_at,
        "trial_ends_at": org.trial_ends_at,
        "subscription": {
            "status": sub.status if sub else None,
            "plan": sub.plan if sub else None,
            "current_period_end": sub.current_period_end if sub else None,
        },
        "users": [
            {
                "id": str(u.id),
                "name": u.name,
                "email": u.email,
                "role": u.role,
                "is_master": u.is_master,
                "is_active": u.is_active,
                "created_at": u.created_at,
                "last_login_at": u.last_login_at,
            }
            for u in users
        ],
        "recent_files": [
            {
                "id": str(f.id),
                "original_filename": f.original_filename,
                "status": f.status,
                "file_size_bytes": f.file_size_bytes,
                "created_at": f.created_at,
            }
            for f in files
        ],
    }


@router.patch("/organizations/{org_id}/status", summary="Bloquear ou ativar organização")
async def update_organization_status(
    org_id: str,
    body: OrgStatusUpdate,
    admin: User = _AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")
    if org.is_mother:
        raise HTTPException(status_code=400, detail="A organização mãe não pode ser bloqueada")

    allowed_statuses = {"active", "suspended", "blocked"}
    if body.status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Status inválido. Use: {', '.join(allowed_statuses)}",
        )

    old_status = org.status
    org.status = body.status
    await log_action(
        db,
        admin.organization_id,
        admin.id,
        admin.email,
        "admin_update_org_status",
        "organization",
        str(org.id),
        f"org={org.name} {old_status} → {body.status}"
        + (f" reason={body.reason}" if body.reason else ""),
    )
    return {"message": f"Status da organização '{org.name}' atualizado para '{body.status}'"}


@router.patch("/organizations/{org_id}/plan", summary="Alterar plano de uma organização")
async def update_organization_plan(
    org_id: str,
    body: OrgPlanUpdate,
    admin: User = _AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")

    allowed_plans = {"trial", "starter", "pro", "enterprise", "free"}
    if body.plan not in allowed_plans:
        raise HTTPException(
            status_code=400, detail=f"Plano inválido. Use: {', '.join(allowed_plans)}"
        )

    old_plan = org.plan
    org.plan = body.plan
    await db.flush()  # staging explícito antes do log
    await log_action(
        db,
        admin.organization_id,
        admin.id,
        admin.email,
        "admin_update_org_plan",
        "organization",
        str(org.id),
        f"org={org.name} {old_plan} → {body.plan}",
    )
    await db.commit()  # commit explícito — não depende apenas do auto-commit
    return {"message": f"Plano da organização '{org.name}' atualizado para '{body.plan}'"}


@router.delete(
    "/organizations/{org_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Excluir organização",
)
async def delete_organization(
    org_id: str,
    admin: User = _AdminUser,
    db: AsyncSession = Depends(get_db),
) -> Response:
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")
    if org.is_mother:
        raise HTTPException(status_code=400, detail="A organização mãe não pode ser excluída")

    await log_action(
        db,
        admin.organization_id,
        admin.id,
        admin.email,
        "admin_delete_org",
        "organization",
        str(org.id),
        f"org={org.name}",
    )
    await db.delete(org)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/users", summary="Listar todos os usuários (cross-tenant)")
async def list_all_users(
    _: User = _AdminUser,
    db: AsyncSession = Depends(get_db),
    search: str | None = Query(None, description="Filtrar por nome ou e-mail"),
    org_id: str | None = Query(None, description="Filtrar por organização"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> list[dict[str, Any]]:
    q = select(User, Organization).join(Organization, User.organization_id == Organization.id)
    if search:
        q = q.where(User.name.ilike(f"%{search}%") | User.email.ilike(f"%{search}%"))
    if org_id:
        q = q.where(User.organization_id == org_id)
    q = q.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    rows = result.all()

    return [
        {
            "id": str(u.id),
            "name": u.name,
            "email": u.email,
            "role": u.role,
            "is_master": u.is_master,
            "is_active": u.is_active,
            "organization_id": str(u.organization_id),
            "organization_name": org.name,
            "organization_is_mother": org.is_mother,
            "created_at": u.created_at,
            "last_login_at": u.last_login_at,
        }
        for u, org in rows
    ]


@router.patch(
    "/users/{user_id}/master", summary="Conceder ou revogar cargo de Mestre (cross-tenant)"
)
async def admin_set_user_master(
    user_id: str,
    body: AdminMasterUpdate,
    admin: User = _AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    member = await db.get(User, user_id)
    if not member:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    if str(member.id) == str(admin.id) and not body.is_master:
        raise HTTPException(
            status_code=400, detail="Não é possível remover seu próprio cargo de Mestre"
        )

    old = member.is_master
    member.is_master = body.is_master
    action = "admin_grant_master" if body.is_master else "admin_revoke_master"
    await log_action(
        db,
        admin.organization_id,
        admin.id,
        admin.email,
        action,
        "user",
        user_id,
        f"email={member.email} org={member.organization_id} is_master: {old} → {body.is_master}",
    )
    return {
        "message": f"Cargo de Mestre {'concedido' if body.is_master else 'revogado'} para {member.email}"
    }


@router.patch("/users/{user_id}/status", summary="Bloquear ou ativar usuário")
async def admin_update_user_status(
    user_id: str,
    body: AdminUserStatusUpdate,
    admin: User = _AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    member = await db.get(User, user_id)
    if not member:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if str(member.id) == str(admin.id) and not body.is_active:
        raise HTTPException(status_code=400, detail="Não é possível bloquear seu próprio usuário")

    old_status = member.is_active
    member.is_active = body.is_active
    action = "admin_activate_user" if body.is_active else "admin_block_user"
    await log_action(
        db,
        admin.organization_id,
        admin.id,
        admin.email,
        action,
        "user",
        user_id,
        f"email={member.email} is_active: {old_status} → {body.is_active}",
    )
    await db.commit()
    return {"message": f"Usuário {'ativado' if body.is_active else 'bloqueado'}: {member.email}"}


# ─── Invite Codes ─────────────────────────────────────────────────────────────

_CODE_ALPHABET = string.ascii_uppercase + string.digits  # A-Z 0-9


def _generate_code() -> str:
    """Gera um código único de 16 caracteres alfanuméricos (maiúsculas + dígitos)."""
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(16))


async def _serialize_invite_code_async(code: OrgInviteCode, db: AsyncSession) -> dict[str, Any]:
    """Serializa um OrgInviteCode sem tocar em nenhum atributo de relacionamento.
    Usa apenas await db.get() — seguro em qualquer versão de SQLAlchemy async."""
    now = datetime.now(UTC)
    expired = code.expires_at < now and not code.used_at

    creator_email: str | None = None
    if code.created_by:
        creator = await db.get(User, code.created_by)
        creator_email = creator.email if creator else None

    used_by_org_name: str | None = None
    if code.used_by_organization_id:
        org = await db.get(Organization, code.used_by_organization_id)
        used_by_org_name = org.name if org else None

    used_by_user_name: str | None = None
    used_by_user_email: str | None = None
    if code.used_by_user_id:
        u = await db.get(User, code.used_by_user_id)
        used_by_user_name = u.name if u else None
        used_by_user_email = u.email if u else None

    return {
        "id": str(code.id),
        "code": code.code,
        "validity_days": code.validity_days,
        "created_at": code.created_at,
        "expires_at": code.expires_at,
        "expired": expired,
        "used": code.used_at is not None,
        "used_at": code.used_at,
        "used_by_organization": used_by_org_name,
        "used_by_user_name": used_by_user_name,
        "used_by_user_email": used_by_user_email,
        "creator_email": creator_email,
    }


@router.get("/invite-codes", summary="Listar códigos de convite")
async def list_invite_codes(
    admin: User = _AdminUser,
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    result = await db.execute(
        select(OrgInviteCode).order_by(OrgInviteCode.created_at.desc()).limit(200)
    )
    codes = result.scalars().all()
    return [await _serialize_invite_code_async(c, db) for c in codes]


@router.post(
    "/invite-codes",
    status_code=status.HTTP_201_CREATED,
    summary="Criar novo código de convite",
)
async def create_invite_code(
    body: InviteCodeCreate,
    admin: User = _AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    # Garante código único — tenta até 5 vezes (colisão improvável)
    for _ in range(5):
        candidate = _generate_code()
        existing = await db.scalar(select(OrgInviteCode).where(OrgInviteCode.code == candidate))
        if not existing:
            break
    else:
        raise HTTPException(status_code=500, detail="Não foi possível gerar código único")

    now = datetime.now(UTC)
    invite = OrgInviteCode(
        id=uuid.uuid4(),
        code=candidate,
        created_by=admin.id,
        validity_days=body.validity_days,
        expires_at=now + timedelta(days=body.validity_days),
        created_at=now,
    )
    db.add(invite)

    await log_action(
        db,
        admin.organization_id,
        admin.id,
        admin.email,
        "create_invite_code",
        "org_invite_code",
        str(invite.id),
        f"code={candidate} validity_days={body.validity_days}",
    )
    await db.commit()

    return await _serialize_invite_code_async(invite, db)


@router.delete(
    "/invite-codes/pending",
    status_code=status.HTTP_200_OK,
    summary="Excluir todos os códigos pendentes (não usados e não expirados)",
)
async def delete_pending_invite_codes(
    admin: User = _AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, int]:
    now = datetime.now(UTC)
    result = await db.execute(
        sql_delete(OrgInviteCode)
        .where(OrgInviteCode.used_at == None)  # noqa: E711
        .where(OrgInviteCode.expires_at > now)
    )
    deleted = result.rowcount
    await log_action(
        db,
        admin.organization_id,
        admin.id,
        admin.email,
        "delete_pending_invite_codes",
        "org_invite_code",
        None,
        f"deleted={deleted}",
    )
    await db.commit()
    return {"deleted": deleted}


@router.delete(
    "/invite-codes/{code_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Revogar código de convite",
)
async def delete_invite_code(
    code_id: str,
    admin: User = _AdminUser,
    db: AsyncSession = Depends(get_db),
):
    invite = await db.get(OrgInviteCode, code_id)
    if not invite:
        raise HTTPException(status_code=404, detail="Código não encontrado")
    if invite.used_at:
        raise HTTPException(status_code=400, detail="Código já utilizado — não pode ser revogado")

    await log_action(
        db,
        admin.organization_id,
        admin.id,
        admin.email,
        "delete_invite_code",
        "org_invite_code",
        code_id,
        f"code={invite.code}",
    )
    await db.delete(invite)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ─── Plan Config ───────────────────────────────────────────────────────────────


class PlanConfigUpdate(BaseModel):
    name: str | None = None
    price_brl: int | None = None
    price_label: str | None = None
    max_users: int | None = None
    max_files: int | None = None
    is_public: bool | None = None
    features: list[str] | None = None
    feature_flags: dict[str, bool] | None = None


@router.get("/plan-configs", summary="Listar configurações de todos os planos")
async def list_plan_configs(admin: User = _AdminUser) -> dict[str, Any]:
    return {
        "plans": get_all_plans(),
        "available_features": get_available_features(),
    }


@router.patch("/plan-configs/{plan_id}", summary="Atualizar configuração de um plano")
async def patch_plan_config(
    plan_id: str,
    body: PlanConfigUpdate,
    admin: User = _AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    updated = update_plan(plan_id, updates)
    if updated is None:
        raise HTTPException(status_code=404, detail=f"Plano '{plan_id}' não encontrado")

    await log_action(
        db,
        admin.organization_id,
        admin.id,
        admin.email,
        "admin_update_plan_config",
        "plan_config",
        plan_id,
        f"fields={list(updates.keys())}",
    )
    await db.commit()
    return updated


# ─── Trial days management ────────────────────────────────────────────────────


class TrialDaysUpdate(BaseModel):
    trial_ends_at: datetime | None = None
    days_from_now: int | None = None


@router.patch("/organizations/{org_id}/trial", summary="Atualizar validade do trial")
async def update_org_trial(
    org_id: uuid.UUID,
    body: TrialDaysUpdate,
    admin: User = _AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")

    if body.days_from_now is not None:
        new_date = datetime.now(UTC) + timedelta(days=body.days_from_now)
        org.trial_ends_at = new_date
    elif body.trial_ends_at is not None:
        org.trial_ends_at = body.trial_ends_at
    else:
        raise HTTPException(status_code=400, detail="Forneça trial_ends_at ou days_from_now")

    await db.commit()
    await db.refresh(org)
    remaining = None
    if org.trial_ends_at:
        delta = org.trial_ends_at - datetime.now(UTC)
        remaining = max(0, delta.days)
    return {
        "id": str(org.id),
        "trial_ends_at": org.trial_ends_at.isoformat() if org.trial_ends_at else None,
        "days_remaining": remaining,
    }


# ─── Admin feedback endpoints ─────────────────────────────────────────────────


class FeedbackStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(pending|reviewed|resolved)$")


class FeedbackResponseUpdate(BaseModel):
    admin_response: str = Field(..., min_length=1, max_length=5000)
    status: str | None = Field(None, pattern="^(pending|reviewed|resolved)$")


@router.get("/feedback", summary="Listar todos os feedbacks (sugestões/reclamações)")
async def list_all_feedback(
    admin: User = _AdminUser,
    db: AsyncSession = Depends(get_db),
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(100, ge=1, le=500),
) -> list[dict[str, Any]]:
    q = (
        select(Feedback, Organization.name.label("org_name"))
        .join(Organization, Feedback.organization_id == Organization.id, isouter=True)
        .order_by(Feedback.created_at.desc())
        .limit(limit)
    )
    if status_filter:
        q = q.where(Feedback.status == status_filter)
    result = await db.execute(q)
    rows = result.all()
    return [
        {
            "id": str(f.id),
            "type": f.type,
            "title": f.title,
            "content": f.content,
            "status": f.status,
            "user_name": f.user_name,
            "user_email": f.user_email,
            "organization_id": str(f.organization_id),
            "organization_name": org_name or "",
            "admin_response": f.admin_response,
            "created_at": f.created_at.isoformat(),
        }
        for f, org_name in rows
    ]


@router.patch("/feedback/{feedback_id}/status", summary="Atualizar status de um feedback")
async def update_feedback_status(
    feedback_id: uuid.UUID,
    body: FeedbackStatusUpdate,
    admin: User = _AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    fb = await db.get(Feedback, feedback_id)
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback não encontrado")
    fb.status = body.status
    await db.commit()
    return {"id": str(fb.id), "status": fb.status}


@router.patch("/feedback/{feedback_id}/respond", summary="Responder a um feedback")
async def respond_feedback(
    feedback_id: uuid.UUID,
    body: FeedbackResponseUpdate,
    admin: User = _AdminUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    fb = await db.get(Feedback, feedback_id)
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback não encontrado")
    fb.admin_response = body.admin_response
    if body.status:
        fb.status = body.status
    elif fb.status == "pending":
        fb.status = "reviewed"
    await db.commit()

    # Notifica o usuário por e-mail (best-effort — não falha a request)
    if fb.user_email:
        try:
            from app.services.email import send_feedback_response_email

            await send_feedback_response_email(
                to=fb.user_email,
                name=fb.user_name or "",
                feedback_type=fb.type,
                title=fb.title,
                response=fb.admin_response,
            )
        except Exception:  # noqa: BLE001
            pass

    return {"id": str(fb.id), "status": fb.status, "admin_response": fb.admin_response}


@router.delete(
    "/feedback/{feedback_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Excluir um feedback",
)
async def delete_feedback(
    feedback_id: uuid.UUID,
    admin: User = _AdminUser,
    db: AsyncSession = Depends(get_db),
) -> Response:
    fb = await db.get(Feedback, feedback_id)
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback não encontrado")
    await db.delete(fb)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
