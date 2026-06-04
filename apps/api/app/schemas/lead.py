from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class ChargerItem(BaseModel):
    """Um tipo de carregador com sua quantidade na simulação multi-carregador."""

    charger_type: str = Field(..., min_length=1, max_length=50)
    num_chargers: int = Field(default=1, ge=1, le=500)


class LeadRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    cnpj: str = Field(
        ..., min_length=11, max_length=20
    )  # aceita CPF (11 dígitos raw) ou CNPJ (18 chars formatado)
    email: EmailStr
    phone: str = Field(..., min_length=10, max_length=20)
    state: str = Field(..., min_length=2, max_length=50)
    city: str = Field(..., min_length=2, max_length=100)
    # Legado — usado quando charger_items não é fornecido
    charger_type: str = Field(default="", max_length=50)
    num_chargers: int = Field(default=1, ge=1, le=500)
    # Multi-carregador — quando presente, tem prioridade sobre charger_type/num_chargers
    charger_items: list[ChargerItem] | None = Field(default=None)
    sector: str = Field(..., min_length=1, max_length=100)
    position: str = Field(..., min_length=1, max_length=100)
    message: str | None = Field(default=None, max_length=1000)


class EnterpriseContactRequest(BaseModel):
    """Contato do formulário Enterprise da página /solucao."""

    name: str = Field(..., min_length=2, max_length=200)
    cnpj: str = Field(..., min_length=11, max_length=20)
    email: EmailStr
    phone: str = Field(..., min_length=10, max_length=20)
    company: str | None = Field(default=None, max_length=200)
    position: str = Field(..., min_length=1, max_length=100)
    message: str | None = Field(default=None, max_length=2000)


class SpecialistMessageRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)


class LeadResponse(BaseModel):
    lead_id: str
    simulation: dict[str, Any]


class LeadListItem(BaseModel):
    id: UUID
    name: str
    email: str
    phone: str
    cnpj: str | None
    state: str
    city: str
    charger_type: str
    sector: str
    position: str
    num_chargers: int
    monthly_revenue: float
    payback_months: float | None
    roi_5y_pct: float
    message: str | None
    specialist_message: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class LeadDetail(LeadListItem):
    simulation_result: dict[str, Any]
    ip_address: str | None


class SimulatorConfigRequest(BaseModel):
    charger_configs: dict[str, Any]
    price_per_kwh: float = Field(ge=0)
    opex_pct: float = Field(ge=0, le=1)
    growth_pct_month: float = Field(ge=0, le=0.5)
    discount_rate_annual: float = Field(ge=0, le=1)
    projection_years: int = Field(ge=1, le=30)


class SimulatorConfigResponse(BaseModel):
    id: UUID
    charger_configs: dict[str, Any]
    price_per_kwh: float
    opex_pct: float
    growth_pct_month: float
    discount_rate_annual: float
    projection_years: int
    updated_at: datetime

    model_config = {"from_attributes": True}


class NotificationEmailRequest(BaseModel):
    email: EmailStr
    name: str | None = None
    states: list[str] = Field(default_factory=list)


class NotificationEmailUpdateRequest(BaseModel):
    name: str | None = None
    states: list[str] | None = None
    is_active: bool | None = None


class NotificationEmailResponse(BaseModel):
    id: UUID
    email: str
    name: str | None
    is_active: bool
    states: list[str]
    created_at: datetime

    model_config = {"from_attributes": True}
