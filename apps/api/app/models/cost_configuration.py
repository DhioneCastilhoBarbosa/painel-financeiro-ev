from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.organization import Organization


class CostConfiguration(Base):
    __tablename__ = "cost_configurations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)

    # ── OPEX — Fixos (R$/mês) ────────────────────────────────────────────────
    energy_cost_per_kwh: Mapped[float] = mapped_column(Float, default=0.75)
    demand_cost: Mapped[float] = mapped_column(Float, default=0.0)
    internet_monthly: Mapped[float] = mapped_column(Float, default=0.0)
    backend_monthly: Mapped[float] = mapped_column(Float, default=0.0)
    preventive_maintenance: Mapped[float] = mapped_column(Float, default=0.0)
    corrective_maintenance: Mapped[float] = mapped_column(Float, default=0.0)
    rent: Mapped[float] = mapped_column(Float, default=0.0)
    insurance: Mapped[float] = mapped_column(Float, default=0.0)
    admin_costs: Mapped[float] = mapped_column(Float, default=0.0)

    # ── OPEX — Variáveis (decimal, ex: 0.025 = 2.5%) ────────────────────────
    payment_gateway_pct: Mapped[float] = mapped_column(Float, default=0.025)
    default_rate_pct: Mapped[float] = mapped_column(Float, default=0.01)

    # ── Split ─────────────────────────────────────────────────────────────────
    revenue_split_pct: Mapped[float] = mapped_column(Float, default=0.0)
    revenue_split_base: Mapped[str] = mapped_column(String(20), default="revenue")  # revenue|ebitda|profit

    # ── Impostos ─────────────────────────────────────────────────────────────
    tax_rate_pct: Mapped[float] = mapped_column(Float, default=0.0)
    tax_base: Mapped[str] = mapped_column(String(20), default="profit")  # revenue|profit

    # ── Parâmetros financeiros ────────────────────────────────────────────────
    depreciation_years: Mapped[int] = mapped_column(Integer, default=5)
    discount_rate_annual: Mapped[float] = mapped_column(Float, default=0.12)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(datetime.UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(datetime.UTC),
        onupdate=lambda: datetime.now(datetime.UTC),
    )

    organization: Mapped[Organization] = relationship("Organization", back_populates="cost_configurations")
