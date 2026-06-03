from __future__ import annotations

import uuid
from datetime import UTC, datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.charging_session import ChargingSession
    from app.models.organization import Organization


class FileStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    done = "done"
    error = "error"


class DataFile(Base):
    __tablename__ = "data_files"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    uploaded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(1000), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    status: Mapped[FileStatus] = mapped_column(String(50), default=FileStatus.pending)
    row_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    date_min: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    date_max: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    stations: Mapped[list] = mapped_column(JSONB, default=list)
    connector_types: Mapped[list] = mapped_column(JSONB, default=list)
    extra_metadata: Mapped[dict] = mapped_column(JSONB, default=dict)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    organization: Mapped[Organization] = relationship("Organization", back_populates="data_files")
    sessions: Mapped[list[ChargingSession]] = relationship(
        "ChargingSession", back_populates="data_file", cascade="all, delete-orphan"
    )
