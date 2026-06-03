import secrets
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.cost_configuration import CostConfiguration
from app.models.data_file import DataFile
from app.models.invitation import Invitation
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.schemas.organization import (
    CostConfigRequest,
    CostConfigResponse,
    InviteRequest,
    MemberResponse,
    OrgUpdateRequest,
    UpdateRoleRequest,
    UsageResponse,
)
from app.services.audit_service import log_action

router = APIRouter()

PLAN_LIMITS = {
    "trial": {"users": 3, "files": 5},
    "starter": {"users": 3, "files": 5},
    "pro": {"users": 10, "files": 30},
    "enterprise": {"users": 9999, "files": 9999},
}


@router.get("")
async def get_org(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    org = await db.get(Organization, current_user.organization_id)
    return {
        "id": str(org.id),
        "name": org.name,
        "slug": org.slug,
        "plan": org.plan,
        "status": org.status,
        "settings": org.settings,
        "created_at": org.created_at,
        "trial_ends_at": org.trial_ends_at,
    }


@router.patch("")
async def update_org(
    body: OrgUpdateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in (UserRole.owner, UserRole.admin):
        raise HTTPException(status_code=403, detail="Permissão insuficiente")

    org = await db.get(Organization, current_user.organization_id)
    if body.name:
        org.name = body.name
    if body.settings is not None:
        changed = {k: v for k, v in body.settings.items() if org.settings.get(k) != v}
        org.settings = {**org.settings, **body.settings}
        if changed:
            details = ", ".join(f"{k}={v}" for k, v in changed.items())
            await log_action(db, current_user.organization_id, current_user.id, current_user.email,
                             "update_settings", "organization", str(org.id), details)
    if body.name:
        await log_action(db, current_user.organization_id, current_user.id, current_user.email,
                         "update_org_name", "organization", str(org.id), f"name={body.name}")
    return {"message": "Organização atualizada"}


@router.get("/members", response_model=list[MemberResponse])
async def list_members(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(User.organization_id == current_user.organization_id)
    )
    return result.scalars().all()


@router.post("/members/invite", status_code=status.HTTP_201_CREATED)
async def invite_member(
    body: InviteRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in (UserRole.owner, UserRole.admin):
        raise HTTPException(status_code=403, detail="Permissão insuficiente")

    # Verifica limite do plano
    org = await db.get(Organization, current_user.organization_id)
    user_count = await db.scalar(
        select(func.count(User.id)).where(User.organization_id == current_user.organization_id)
    )
    limit = PLAN_LIMITS.get(org.plan, {}).get("users", 3)
    if user_count >= limit:
        raise HTTPException(status_code=403, detail=f"Limite de {limit} usuários atingido no plano {org.plan}")

    # Verifica se já é membro
    existing = await db.scalar(select(User).where(User.email == body.email))
    if existing and str(existing.organization_id) == str(current_user.organization_id):
        raise HTTPException(status_code=409, detail="Usuário já é membro da organização")

    # Resolve custom_role_id — valida que pertence à organização
    resolved_custom_role_id = None
    custom_role_name = None
    if body.custom_role_id:
        from app.models.custom_role import CustomRole
        cr = await db.get(CustomRole, body.custom_role_id)
        if cr and str(cr.organization_id) == str(current_user.organization_id):
            resolved_custom_role_id = cr.id
            custom_role_name = cr.name

    token = secrets.token_urlsafe(32)
    invite = Invitation(
        id=uuid.uuid4(),
        organization_id=current_user.organization_id,
        email=body.email,
        role=body.role,
        token=token,
        invited_by=current_user.id,
        expires_at=datetime.now(datetime.UTC) + timedelta(hours=48),
        custom_role_id=resolved_custom_role_id,
    )
    db.add(invite)
    await db.flush()

    from app.services.email import send_invite_email
    role_labels = {"owner": "Proprietário", "admin": "Administrador", "analyst": "Analista", "viewer": "Visualizador"}
    display_role = custom_role_name or role_labels.get(body.role, body.role)
    await send_invite_email(body.email, org.name, display_role, token)

    await log_action(db, current_user.organization_id, current_user.id, current_user.email,
                     "invite_member", "invitation", str(invite.id),
                     f"email={body.email} role={body.role}" + (f" cargo={custom_role_name}" if custom_role_name else ""))

    return {"message": "Convite enviado", "token": token}


@router.get("/invitations")
async def list_invitations(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    if current_user.role not in (UserRole.owner, UserRole.admin):
        raise HTTPException(status_code=403, detail="Permissão insuficiente")

    result = await db.execute(
        select(Invitation).where(
            Invitation.organization_id == current_user.organization_id,
            Invitation.accepted_at.is_(None),
            Invitation.expires_at > datetime.now(datetime.UTC),
        )
    )
    invites = result.scalars().all()
    return [
        {
            "id": str(inv.id),
            "email": inv.email,
            "role": inv.role,
            "created_at": inv.created_at,
            "expires_at": inv.expires_at,
        }
        for inv in invites
    ]


@router.delete("/invitations/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_invitation(
    invitation_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in (UserRole.owner, UserRole.admin):
        raise HTTPException(status_code=403, detail="Permissão insuficiente")

    invite = await db.get(Invitation, invitation_id)
    if not invite or str(invite.organization_id) != str(current_user.organization_id):
        raise HTTPException(status_code=404, detail="Convite não encontrado")

    await log_action(db, current_user.organization_id, current_user.id, current_user.email,
                     "cancel_invitation", "invitation", invitation_id,
                     f"email={invite.email} role={invite.role}")
    await db.delete(invite)


@router.patch("/members/{user_id}")
async def update_member_role(
    user_id: str,
    body: UpdateRoleRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in (UserRole.owner, UserRole.admin):
        raise HTTPException(status_code=403, detail="Permissão insuficiente")

    member = await db.get(User, user_id)
    if not member or str(member.organization_id) != str(current_user.organization_id):
        raise HTTPException(status_code=404, detail="Membro não encontrado")

    if str(member.id) == str(current_user.id):
        raise HTTPException(status_code=400, detail="Não é possível alterar sua própria role")

    old_role = member.role
    member.role = body.role
    await log_action(db, current_user.organization_id, current_user.id, current_user.email,
                     "update_member_role", "user", user_id,
                     f"email={member.email} {old_role} → {body.role}")
    return {"message": "Role atualizada"}


@router.delete("/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    user_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in (UserRole.owner, UserRole.admin):
        raise HTTPException(status_code=403, detail="Permissão insuficiente")

    member = await db.get(User, user_id)
    if not member or str(member.organization_id) != str(current_user.organization_id):
        raise HTTPException(status_code=404, detail="Membro não encontrado")

    if str(member.id) == str(current_user.id):
        raise HTTPException(status_code=400, detail="Não é possível remover a si mesmo")

    # Garante que não remove o último owner
    if member.role == UserRole.owner:
        owner_count = await db.scalar(
            select(func.count(User.id)).where(
                User.organization_id == current_user.organization_id,
                User.role == UserRole.owner,
            )
        )
        if owner_count <= 1:
            raise HTTPException(status_code=400, detail="Não é possível remover o único owner")

    await log_action(db, current_user.organization_id, current_user.id, current_user.email,
                     "remove_member", "user", user_id,
                     f"email={member.email} role={member.role}")
    member.is_active = False


@router.get("/usage", response_model=UsageResponse)
async def get_usage(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    org = await db.get(Organization, current_user.organization_id)
    user_count = await db.scalar(
        select(func.count(User.id)).where(
            User.organization_id == current_user.organization_id, User.is_active.is_(True)
        )
    )
    file_count = await db.scalar(
        select(func.count(DataFile.id)).where(DataFile.organization_id == current_user.organization_id)
    )
    limits = PLAN_LIMITS.get(org.plan, PLAN_LIMITS["starter"])
    return UsageResponse(
        users_used=user_count or 0,
        users_limit=limits["users"],
        files_used=file_count or 0,
        files_limit=limits["files"],
        plan=org.plan,
        trial_ends_at=org.trial_ends_at,
    )


# ─── Cost Configurations ─────────────────────────────────────────────────────

@router.get("/cost-configs", response_model=list[CostConfigResponse])
async def list_cost_configs(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CostConfiguration).where(CostConfiguration.organization_id == current_user.organization_id)
    )
    return result.scalars().all()


@router.post("/cost-configs", response_model=CostConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_cost_config(
    body: CostConfigRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    if body.is_default:
        # Remove default dos outros
        existing = await db.execute(
            select(CostConfiguration).where(
                CostConfiguration.organization_id == current_user.organization_id,
                CostConfiguration.is_default.is_(True),
            )
        )
        for cfg in existing.scalars():
            cfg.is_default = False

    config = CostConfiguration(
        id=uuid.uuid4(),
        organization_id=current_user.organization_id,
        **body.model_dump(),
    )
    db.add(config)
    await db.flush()
    return config


@router.put("/cost-configs/{config_id}", response_model=CostConfigResponse)
async def update_cost_config(
    config_id: str,
    body: CostConfigRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    config = await db.get(CostConfiguration, config_id)
    if not config or str(config.organization_id) != str(current_user.organization_id):
        raise HTTPException(status_code=404, detail="Configuração não encontrada")

    for field, value in body.model_dump().items():
        setattr(config, field, value)
    return config


@router.post("/cost-configs/{config_id}/activate", response_model=CostConfigResponse)
async def activate_cost_config(
    config_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    config = await db.get(CostConfiguration, config_id)
    if not config or str(config.organization_id) != str(current_user.organization_id):
        raise HTTPException(status_code=404, detail="Configuração não encontrada")

    # Unset all others, set this one as default
    existing = await db.execute(
        select(CostConfiguration).where(
            CostConfiguration.organization_id == current_user.organization_id
        )
    )
    for cfg in existing.scalars():
        cfg.is_default = str(cfg.id) == str(config.id)

    await db.flush()
    return config


@router.delete("/cost-configs/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cost_config(
    config_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    config = await db.get(CostConfiguration, config_id)
    if not config or str(config.organization_id) != str(current_user.organization_id):
        raise HTTPException(status_code=404, detail="Configuração não encontrada")
    await db.delete(config)
