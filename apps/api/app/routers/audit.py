"""Leitura do log de auditoria da organização."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.audit_log import AuditLog

router = APIRouter()


@router.get("")
async def list_audit_log(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
):
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.organization_id == current_user.organization_id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )
    entries = result.scalars().all()
    return [
        {
            "id": str(e.id),
            "user_email": e.user_email,
            "action": e.action,
            "entity_type": e.entity_type,
            "entity_id": e.entity_id,
            "details": e.details,
            "created_at": e.created_at,
        }
        for e in entries
    ]
