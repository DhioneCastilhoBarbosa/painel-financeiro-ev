import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Float, Integer
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

DEFAULT_CHARGER_CONFIGS: dict = {
    "AC 7,4 kW": {
        "price_brl": 8000,
        "power_kw": 7.4,
        "avg_sessions_day": 3,
        "avg_duration_min": 90,
    },
    "AC 22 kW": {
        "price_brl": 15000,
        "power_kw": 22.0,
        "avg_sessions_day": 4,
        "avg_duration_min": 60,
    },
    "DC 30 kW": {
        "price_brl": 45000,
        "power_kw": 30.0,
        "avg_sessions_day": 5,
        "avg_duration_min": 45,
    },
    "DC 60 kW": {
        "price_brl": 75000,
        "power_kw": 60.0,
        "avg_sessions_day": 6,
        "avg_duration_min": 35,
    },
    "DC 80 kW": {
        "price_brl": 95000,
        "power_kw": 80.0,
        "avg_sessions_day": 6,
        "avg_duration_min": 30,
    },
    "DC 120 kW": {
        "price_brl": 130000,
        "power_kw": 120.0,
        "avg_sessions_day": 7,
        "avg_duration_min": 25,
    },
    "DC 180 kW": {
        "price_brl": 180000,
        "power_kw": 180.0,
        "avg_sessions_day": 8,
        "avg_duration_min": 20,
    },
}


class SimulatorConfig(Base):
    __tablename__ = "simulator_config"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    charger_configs: Mapped[dict] = mapped_column(JSONB, nullable=False, default=lambda: DEFAULT_CHARGER_CONFIGS)
    price_per_kwh: Mapped[float] = mapped_column(Float, nullable=False, default=0.85)
    opex_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0.25)
    growth_pct_month: Mapped[float] = mapped_column(Float, nullable=False, default=0.03)
    discount_rate_annual: Mapped[float] = mapped_column(Float, nullable=False, default=0.12)
    projection_years: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
