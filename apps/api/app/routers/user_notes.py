"""CRUD de notas por user_tag dentro de uma organização."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.user_note import UserNote
from app.services.audit_service import log_action

router = APIRouter()


class NoteUpsert(BaseModel):
    content: str


@router.get("/{user_tag}")
async def get_note(
    user_tag: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserNote).where(
            UserNote.organization_id == current_user.organization_id,
            UserNote.user_tag == user_tag,
        )
    )
    note = result.scalars().first()
    if not note:
        return {"user_tag": user_tag, "content": "", "updated_at": None}
    return {"user_tag": note.user_tag, "content": note.content, "updated_at": note.updated_at}


@router.put("/{user_tag}")
async def upsert_note(
    user_tag: str,
    body: NoteUpsert,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserNote).where(
            UserNote.organization_id == current_user.organization_id,
            UserNote.user_tag == user_tag,
        )
    )
    note = result.scalars().first()
    if note:
        note.content = body.content
        note.updated_at = datetime.now(timezone.utc)
    else:
        note = UserNote(
            id=uuid.uuid4(),
            organization_id=current_user.organization_id,
            user_tag=user_tag,
            content=body.content,
            created_by=current_user.id,
        )
        db.add(note)
    await db.flush()
    await log_action(db, current_user.organization_id, current_user.id, current_user.email,
                     "save_user_note", "user_note", user_tag,
                     f"length={len(body.content)}")
    return {"user_tag": user_tag, "content": note.content, "updated_at": note.updated_at}
