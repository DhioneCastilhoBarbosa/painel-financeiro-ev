import uuid
from datetime import UTC, date, datetime

from sqlalchemy import Date, DateTime, Float, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ChargerCapex(Base):
    """
    Registro manual de investimento por carregador ou grupo de carregadores.
    Usado para calcular payback real com base nos dados de sessões importadas.
    """

    __tablename__ = "charger_capex"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)

    # Identificação
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    charger_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    num_chargers: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # Vinculação aos dados de sessão (station_name nos CSVs)
    station_key: Mapped[str | None] = mapped_column(String(500), nullable=True, index=True)

    # Investimento
    capex_brl: Mapped[float] = mapped_column(Float, nullable=False)
    opex_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0.25)
    tax_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Estimativa manual (quando não há dados de sessão vinculados)
    monthly_revenue_est: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Quando o carregador entrou em operação
    installed_at: Mapped[date] = mapped_column(Date, nullable=False)

    notes: Mapped[str | None] = mapped_column(String(2000), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
