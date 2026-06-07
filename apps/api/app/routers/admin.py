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
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.charging_session import ChargingSession
from app.models.data_file import DataFile
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


def _serialize_invite_code(code: OrgInviteCode) -> dict[str, Any]:
    now = datetime.now(UTC)
    expired = code.expires_at < now and not code.used_at
    return {
        "id": str(code.id),
        "code": code.code,
        "validity_days": code.validity_days,
        "created_at": code.created_at,
        "expires_at": code.expires_at,
        "expired": expired,
        "used": code.used_at is not None,
        "used_at": code.used_at,
        "used_by_organization": code.used_by_org.name if code.used_by_org else None,
        "used_by_user_name": code.used_by_user.name if code.used_by_user else None,
        "used_by_user_email": code.used_by_user.email if code.used_by_user else None,
        "creator_email": code.creator.email if code.creator else None,
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

    # eager-load relations manually
    for c in codes:
        if c.created_by:
            await db.get(User, c.created_by)
        if c.used_by_organization_id:
            await db.get(Organization, c.used_by_organization_id)
        if c.used_by_user_id:
            await db.get(User, c.used_by_user_id)

    return [_serialize_invite_code(c) for c in codes]


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
    await db.refresh(invite)

    # load relations
    if invite.created_by:
        await db.get(User, invite.created_by)

    return _serialize_invite_code(invite)


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
