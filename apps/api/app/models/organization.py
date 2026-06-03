from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.cost_configuration import CostConfiguration
    from app.models.data_file import DataFile
    from app.models.payback_scenario import PaybackScenario
    from app.models.subscription import Subscription
    from app.models.user import User


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    plan: Mapped[str] = mapped_column(String(50), default="trial")
    status: Mapped[str] = mapped_column(String(50), default="active")
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    users: Mapped[list[User]] = relationship("User", back_populates="organization")
    data_files: Mapped[list[DataFile]] = relationship("DataFile", back_populates="organization")
    cost_configurations: Mapped[list[CostConfiguration]] = relationship(
        "CostConfiguration", back_populates="organization"
    )
    payback_scenarios: Mapped[list[PaybackScenario]] = relationship(
        "PaybackScenario", back_populates="organization"
    )
    subscription: Mapped[Subscription | None] = relationship(
        "Subscription", back_populates="organization", uselist=False
    )
