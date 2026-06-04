"""Utility to write audit log entries from any router."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


async def log_action(
    db: AsyncSession,
    organization_id,
    user_id,
    user_email: str,
    action: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
    details: str | None = None,
) -> None:
    """Append an audit entry. The caller's transaction commits it."""
    entry = AuditLog(
        id=uuid.uuid4(),
        organization_id=organization_id,
        user_id=user_id,
        user_email=user_email,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details,
    )
    db.add(entry)
