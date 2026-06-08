import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
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
from app.core.plan_config import get_plan_limits
from app.services.audit_service import log_action

router = APIRouter()


class MasterGrantRequest(BaseModel):
    is_master: bool


# Fallback em memória — get_plan_limits() lê do JSON dinâmico configurado no admin
def _plan_limits(plan: str) -> dict:
    return get_plan_limits(plan)


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


@router.get("/features")
async def get_org_features(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    """Retorna as feature_flags do plano atual da organização.

    A organização mãe (Intelbras) sempre recebe todas as features habilitadas,
    independente do plano configurado — ela não está sujeita a restrições de plano.
    """
    org = await db.get(Organization, current_user.organization_id)
    if not org:
        return {"plan": "unknown", "plan_name": "Unknown", "feature_flags": {}}

    # Organização mãe tem acesso irrestrito a todas as features
    if org.is_mother:
        from app.core.plan_config import get_available_features
        all_flags = {f["key"]: True for f in get_available_features()}
        return {"plan": "enterprise", "plan_name": "Enterprise", "feature_flags": all_flags}

    plan_cfg = get_plan(org.plan)
    return {
        "plan": org.plan,
        "plan_name": plan_cfg["name"] if plan_cfg else org.plan,
        "feature_flags": plan_cfg.get("feature_flags", {}) if plan_cfg else {},
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
        # Garante unicidade e impede uso do nome reservado
        if body.name.strip().lower() == "intelbras":
            raise HTTPException(status_code=400, detail="O nome 'Intelbras' é reservado")
        existing_name = await db.scalar(
            select(Organization).where(
                Organization.name == body.name,
                Organization.id != current_user.organization_id,
            )
        )
        if existing_name:
            raise HTTPException(status_code=409, detail="Já existe uma organização com esse nome")
        org.name = body.name
    if body.settings is not None:
        changed = {k: v for k, v in body.settings.items() if org.settings.get(k) != v}
        org.settings = {**org.settings, **body.settings}
        if changed:
            details = ", ".join(f"{k}={v}" for k, v in changed.items())
            await log_action(
                db,
                current_user.organization_id,
                current_user.id,
                current_user.email,
                "update_settings",
                "organization",
                str(org.id),
                details,
            )
    if body.name:
        await log_action(
            db,
            current_user.organization_id,
            current_user.id,
            current_user.email,
            "update_org_name",
            "organization",
            str(org.id),
            f"name={body.name}",
        )
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
    limit = _plan_limits(org.plan).get("users", 3)
    if user_count >= limit:
        raise HTTPException(
            status_code=403, detail=f"Limite de {limit} usuários atingido no plano {org.plan}"
        )

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
        expires_at=datetime.now(UTC) + timedelta(hours=48),
        custom_role_id=resolved_custom_role_id,
    )
    db.add(invite)
    await db.flush()

    from app.services.email import send_invite_email

    role_labels = {
        "owner": "Proprietário",
        "admin": "Administrador",
        "analyst": "Analista",
        "viewer": "Visualizador",
    }
    display_role = custom_role_name or role_labels.get(body.role, body.role)
    await send_invite_email(body.email, org.name, display_role, token)

    await log_action(
        db,
        current_user.organization_id,
        current_user.id,
        current_user.email,
        "invite_member",
        "invitation",
        str(invite.id),
        f"email={body.email} role={body.role}"
        + (f" cargo={custom_role_name}" if custom_role_name else ""),
    )

    return {"message": "Convite enviado", "token": token}


@router.get("/invitations")
async def list_invitations(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    if current_user.role not in (UserRole.owner, UserRole.admin):
        raise HTTPException(status_code=403, detail="Permissão insuficiente")

    result = await db.execute(
        select(Invitation)
        .where(Invitation.organization_id == current_user.organization_id)
        .order_by(Invitation.created_at.desc())
    )
    invites = result.scalars().all()

    # Resolve custom role names in one query
    custom_role_ids = [inv.custom_role_id for inv in invites if inv.custom_role_id]
    custom_role_names: dict[str, str] = {}
    if custom_role_ids:
        from app.models.custom_role import CustomRole

        cr_result = await db.execute(
            select(CustomRole.id, CustomRole.name).where(CustomRole.id.in_(custom_role_ids))
        )
        custom_role_names = {str(row.id): row.name for row in cr_result}

    now = datetime.now(UTC)
    return [
        {
            "id": str(inv.id),
            "email": inv.email,
            "role": inv.role,
            "custom_role_name": custom_role_names.get(str(inv.custom_role_id))
            if inv.custom_role_id
            else None,
            "token": inv.token,
            "created_at": inv.created_at,
            "expires_at": inv.expires_at,
            "accepted_at": inv.accepted_at,
            "status": "concluído" if inv.accepted_at else ("expirado" if inv.expires_at <= now else "pendente"),
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

    await log_action(
        db,
        current_user.organization_id,
        current_user.id,
        current_user.email,
        "cancel_invitation",
        "invitation",
        invitation_id,
        f"email={invite.email} role={invite.role}",
    )
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
    await log_action(
        db,
        current_user.organization_id,
        current_user.id,
        current_user.email,
        "update_member_role",
        "user",
        user_id,
        f"email={member.email} {old_role} → {body.role}",
    )
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

    await log_action(
        db,
        current_user.organization_id,
        current_user.id,
        current_user.email,
        "remove_member",
        "user",
        user_id,
        f"email={member.email} role={member.role}",
    )
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
        select(func.count(DataFile.id)).where(
            DataFile.organization_id == current_user.organization_id
        )
    )
    limits = _plan_limits(org.plan)
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
        select(CostConfiguration).where(
            CostConfiguration.organization_id == current_user.organization_id
        )
    )
    return result.scalars().all()


@router.post(
    "/cost-configs", response_model=CostConfigResponse, status_code=status.HTTP_201_CREATED
)
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


# ─── Master grant / revoke ────────────────────────────────────────────────────


@router.patch(
    "/members/{user_id}/master",
    summary="Conceder ou revogar cargo de Mestre (apenas Mestres podem fazer isso)",
)
async def set_member_master(
    user_id: str,
    body: MasterGrantRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """
    Somente usuários com `is_master=true` podem conceder ou revogar o cargo de Mestre.
    Não é possível remover o próprio cargo.
    """
    if not current_user.is_master:
        raise HTTPException(
            status_code=403, detail="Apenas usuários Mestres podem gerenciar este cargo"
        )

    member = await db.get(User, user_id)
    if not member or str(member.organization_id) != str(current_user.organization_id):
        raise HTTPException(status_code=404, detail="Membro não encontrado")

    if str(member.id) == str(current_user.id) and not body.is_master:
        raise HTTPException(
            status_code=400, detail="Não é possível remover seu próprio cargo de Mestre"
        )

    old = member.is_master
    member.is_master = body.is_master
    action = "grant_master" if body.is_master else "revoke_master"
    await log_action(
        db,
        current_user.organization_id,
        current_user.id,
        current_user.email,
        action,
        "user",
        user_id,
        f"email={member.email} is_master: {old} → {body.is_master}",
    )
    return {
        "message": f"Cargo de Mestre {'concedido' if body.is_master else 'revogado'} com sucesso"
    }
