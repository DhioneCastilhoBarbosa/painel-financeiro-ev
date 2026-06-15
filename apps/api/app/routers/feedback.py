"""
Feedback — sugestões e reclamações dos usuários.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.feedback import Feedback

router = APIRouter()


# ─── Schemas ─────────────────────────────────────────────────────────────────


class FeedbackCreate(BaseModel):
    type: Literal["suggestion", "complaint"]
    title: str
    content: str


class FeedbackOut(BaseModel):
    id: uuid.UUID
    type: str
    title: str
    content: str
    status: str
    user_name: str
    user_email: str
    organization_id: uuid.UUID
    admin_response: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Endpoints ────────────────────────────────────────────────────────────────


@router.post("", response_model=FeedbackOut, status_code=status.HTTP_201_CREATED)
async def create_feedback(
    body: FeedbackCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> Feedback:
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="Título não pode ser vazio")
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="Conteúdo não pode ser vazio")

    fb = Feedback(
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        user_name=current_user.name,
        user_email=current_user.email,
        type=body.type,
        title=body.title.strip(),
        content=body.content.strip(),
        status="pending",
    )
    db.add(fb)
    await db.commit()
    await db.refresh(fb)
    return fb


@router.get("", response_model=list[FeedbackOut])
async def list_feedback(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
) -> list[Feedback]:
    result = await db.execute(
        select(Feedback)
        .where(Feedback.organization_id == current_user.organization_id)
        .order_by(Feedback.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())
