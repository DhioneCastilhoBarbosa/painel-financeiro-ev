import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Numeric, PrimaryKeyConstraint, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ChargingSession(Base):
    """
    Hypertable do TimescaleDB — particionada por started_at.
    PK composta (id, started_at) exigida pelo TimescaleDB para hypertables.
    """

    __tablename__ = "charging_sessions"
    __table_args__ = (PrimaryKeyConstraint("id", "started_at"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    file_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("data_files.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Temporal
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Location & hardware
    station_name: Mapped[str | None] = mapped_column(String(500), nullable=True, index=True)
    connector_type: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)

    # User
    user_name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    user_tag: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Revenue components (R$)
    revenue_total: Mapped[float] = mapped_column(Numeric(10, 4), default=0)
    revenue_start_fee: Mapped[float] = mapped_column(Numeric(10, 4), default=0)
    revenue_energy: Mapped[float] = mapped_column(Numeric(10, 4), default=0)
    revenue_idle: Mapped[float] = mapped_column(Numeric(10, 4), default=0)

    # Energy
    energy_kwh: Mapped[float] = mapped_column(Numeric(10, 4), default=0)

    # Payment
    payment_status: Mapped[str | None] = mapped_column(String(50), nullable=True)  # paid|pending|rejected
    payment_method: Mapped[str | None] = mapped_column(String(50), nullable=True)  # pagbank|wallet|voucher|manual
    is_paid: Mapped[bool] = mapped_column(Boolean, default=False)
    has_voucher: Mapped[bool] = mapped_column(Boolean, default=False)

    # Raw data for audit
    raw: Mapped[dict] = mapped_column(JSONB, default=dict)

    # Relationships
    data_file: Mapped["DataFile"] = relationship("DataFile", back_populates="sessions")
