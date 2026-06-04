from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.user import User


class OrgInviteCode(Base):
    __tablename__ = "org_invite_codes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Código de 16 chars alfanuméricos gerado aleatoriamente
    code: Mapped[str] = mapped_column(String(16), unique=True, nullable=False, index=True)

    # Quem gerou (usuário Master da Intelbras)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Validade em dias (ex: 7, 30)
    validity_days: Mapped[int] = mapped_column(Integer, nullable=False, default=7)

    # Data de expiração calculada na criação
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Se e quando foi usado
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Org criada com este código
    used_by_organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Usuário (owner) que usou o código
    used_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(datetime.UTC)
    )

    # Relationships
    creator: Mapped[User | None] = relationship("User", foreign_keys=[created_by])
    used_by_org: Mapped[Organization | None] = relationship(
        "Organization", foreign_keys=[used_by_organization_id]
    )
    used_by_user: Mapped[User | None] = relationship("User", foreign_keys=[used_by_user_id])
