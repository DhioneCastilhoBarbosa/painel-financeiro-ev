
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ChargerCapexCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    charger_type: str | None = Field(default=None, max_length=50)
    num_chargers: int = Field(default=1, ge=1, le=500)
    station_key: str | None = Field(default=None, max_length=500)
    capex_brl: float = Field(..., ge=0)
    opex_pct: float = Field(default=0.25, ge=0, le=1)
    tax_pct: float = Field(default=0.0, ge=0, le=1)
    monthly_revenue_est: float | None = Field(default=None, ge=0)
    installed_at: date
    notes: str | None = Field(default=None, max_length=2000)


class ChargerCapexUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    charger_type: str | None = None
    num_chargers: int | None = Field(default=None, ge=1, le=500)
    station_key: str | None = None
    capex_brl: float | None = Field(default=None, ge=0)
    opex_pct: float | None = Field(default=None, ge=0, le=1)
    tax_pct: float | None = Field(default=None, ge=0, le=1)
    monthly_revenue_est: float | None = None
    installed_at: date | None = None
    notes: str | None = None


class CapexPerformance(BaseModel):
    """Métricas calculadas com base nos dados de sessão ou estimativa manual."""

    months_elapsed: float
    # Receita
    revenue_total: float       # desde installed_at (de sessões ou estimativa)
    monthly_revenue_avg: float # média dos últimos 90 dias ou estimativa
    # Custos
    opex_total: float
    tax_total: float
    net_total: float           # receita - opex - impostos
    # Posição acumulada (negativa = ainda em payback)
    cumulative: float          # net_total - capex_brl
    # Projeção
    payback_months: float | None   # total de meses estimados para payback
    months_remaining: float | None # meses restantes (None se já recuperou)
    progress_pct: float            # 0-100, quanto do CAPEX já foi recuperado
    # Fonte dos dados
    data_source: str               # "sessions" | "estimate" | "none"
    sessions_count: int


class ChargerCapexResponse(BaseModel):
    id: UUID
    org_id: UUID
    name: str
    charger_type: str | None
    num_chargers: int
    station_key: str | None
    capex_brl: float
    opex_pct: float
    tax_pct: float
    monthly_revenue_est: float | None
    installed_at: date
    notes: str | None
    created_at: datetime
    updated_at: datetime
    performance: CapexPerformance

    model_config = {"from_attributes": True}
