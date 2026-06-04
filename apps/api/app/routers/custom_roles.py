"""CRUD de roles personalizados — apenas admin/owner."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.custom_role import CustomRole
from app.models.user import User, UserRole
from app.services.audit_service import log_action
from app.services.permissions import ALL_PERMISSIONS

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────


class CustomRoleCreate(BaseModel):
    name: str
    description: str | None = None
    permissions: dict[str, bool] = {}


class CustomRoleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    permissions: dict[str, bool] | None = None


class CustomRoleResponse(BaseModel):
    id: str
    name: str
    description: str | None
    permissions: dict[str, bool]
    member_count: int
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class AssignRoleRequest(BaseModel):
    custom_role_id: str | None  # None = remover custom role (volta para built-in)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _require_admin(current_user: User) -> None:
    if current_user.role not in (UserRole.owner, UserRole.admin):
        raise HTTPException(status_code=403, detail="Apenas administradores podem gerenciar roles")


def _serialize(role: CustomRole, member_count: int = 0) -> dict:
    return {
        "id": str(role.id),
        "name": role.name,
        "description": role.description,
        "permissions": {p: bool(role.permissions.get(p, False)) for p in ALL_PERMISSIONS},
        "member_count": member_count,
        "created_at": role.created_at.isoformat(),
        "updated_at": role.updated_at.isoformat(),
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("")
async def list_roles(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    _require_admin(current_user)
    result = await db.execute(
        select(CustomRole)
        .where(CustomRole.organization_id == current_user.organization_id)
        .order_by(CustomRole.created_at)
    )
    roles = result.scalars().all()

    # Conta membros por role
    member_counts: dict[str, int] = {}
    for role in roles:
        count_result = await db.execute(
            select(User).where(
                User.organization_id == current_user.organization_id,
                User.custom_role_id == role.id,
                User.is_active.is_(True),
            )
        )
        member_counts[str(role.id)] = len(count_result.scalars().all())

    return [_serialize(r, member_counts.get(str(r.id), 0)) for r in roles]


_RESERVED_ROLE_NAMES = {"master", "owner", "admin", "analyst", "viewer"}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_role(
    body: CustomRoleCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)

    if body.name.strip().lower() in _RESERVED_ROLE_NAMES:
        raise HTTPException(
            status_code=400,
            detail=f"O nome '{body.name.strip()}' é reservado pelo sistema. Use outro nome para o cargo.",
        )

    # Garante que apenas permissões válidas entram
    perms = {p: bool(body.permissions.get(p, False)) for p in ALL_PERMISSIONS}

    role = CustomRole(
        id=uuid.uuid4(),
        organization_id=current_user.organization_id,
        name=body.name.strip(),
        description=body.description,
        permissions=perms,
    )
    db.add(role)
    await db.flush()

    await log_action(
        db,
        current_user.organization_id,
        current_user.id,
        current_user.email,
        "create_custom_role",
        "custom_role",
        str(role.id),
        f"name={role.name}",
    )
    await db.commit()
    return _serialize(role)


@router.put("/{role_id}")
async def update_role(
    role_id: str,
    body: CustomRoleUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)
    role = await db.get(CustomRole, role_id)
    if not role or str(role.organization_id) != str(current_user.organization_id):
        raise HTTPException(status_code=404, detail="Role não encontrado")

    if body.name is not None:
        new_name = body.name.strip()
        if new_name.lower() in _RESERVED_ROLE_NAMES:
            raise HTTPException(
                status_code=400,
                detail=f"O nome '{new_name}' é reservado pelo sistema. Use outro nome para o cargo.",
            )
        role.name = new_name
    if body.description is not None:
        role.description = body.description
    if body.permissions is not None:
        role.permissions = {p: bool(body.permissions.get(p, False)) for p in ALL_PERMISSIONS}

    await log_action(
        db,
        current_user.organization_id,
        current_user.id,
        current_user.email,
        "update_custom_role",
        "custom_role",
        role_id,
        f"name={role.name}",
    )
    await db.commit()
    return _serialize(role)


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    role_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)
    role = await db.get(CustomRole, role_id)
    if not role or str(role.organization_id) != str(current_user.organization_id):
        raise HTTPException(status_code=404, detail="Role não encontrado")

    # Membros com este role voltam para o built-in (SET NULL via FK)
    await log_action(
        db,
        current_user.organization_id,
        current_user.id,
        current_user.email,
        "delete_custom_role",
        "custom_role",
        role_id,
        f"name={role.name}",
    )
    await db.delete(role)
    await db.commit()


@router.post("/{role_id}/assign/{user_id}")
async def assign_role_to_member(
    role_id: str,
    user_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Atribui um custom role a um membro."""
    _require_admin(current_user)
    role = await db.get(CustomRole, role_id)
    if not role or str(role.organization_id) != str(current_user.organization_id):
        raise HTTPException(status_code=404, detail="Role não encontrado")

    member = await db.get(User, user_id)
    if not member or str(member.organization_id) != str(current_user.organization_id):
        raise HTTPException(status_code=404, detail="Membro não encontrado")
    if member.role in (UserRole.owner, UserRole.admin):
        raise HTTPException(status_code=400, detail="owner e admin não podem receber custom roles")

    member.custom_role_id = role.id
    await log_action(
        db,
        current_user.organization_id,
        current_user.id,
        current_user.email,
        "assign_custom_role",
        "user",
        user_id,
        f"email={member.email} role={role.name}",
    )
    await db.commit()
    return {"message": "Role atribuído"}


@router.delete("/{role_id}/assign/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_role_from_member(
    role_id: str,
    user_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Remove custom role de um membro (volta para built-in)."""
    _require_admin(current_user)
    member = await db.get(User, user_id)
    if not member or str(member.organization_id) != str(current_user.organization_id):
        raise HTTPException(status_code=404, detail="Membro não encontrado")

    member.custom_role_id = None
    await log_action(
        db,
        current_user.organization_id,
        current_user.id,
        current_user.email,
        "remove_custom_role",
        "user",
        user_id,
        f"email={member.email}",
    )
    await db.commit()
