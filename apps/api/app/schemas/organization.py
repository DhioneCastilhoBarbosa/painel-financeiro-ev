from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, EmailStr


class OrgUpdateRequest(BaseModel):
    name: str | None = None
    settings: dict | None = None


class MemberResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class InviteRequest(BaseModel):
    email: EmailStr
    role: str = "analyst"
    custom_role_id: str | None = None


class UpdateRoleRequest(BaseModel):
    role: str


class CostConfigRequest(BaseModel):
    name: str
    is_default: bool = False
    # OPEX fixos (R$/mês)
    energy_cost_per_kwh: float = 0.75
    demand_cost: float = 0.0
    internet_monthly: float = 0.0
    backend_monthly: float = 0.0
    preventive_maintenance: float = 0.0
    corrective_maintenance: float = 0.0
    rent: float = 0.0
    insurance: float = 0.0
    admin_costs: float = 0.0
    # OPEX variáveis (decimal, ex: 0.025 = 2.5%)
    payment_gateway_pct: float = 0.025
    default_rate_pct: float = 0.01
    # Split
    revenue_split_pct: float = 0.0
    revenue_split_base: str = "revenue"
    # Impostos
    tax_rate_pct: float = 0.0
    tax_base: str = "profit"
    # Parâmetros financeiros
    depreciation_years: int = 5
    discount_rate_annual: float = 0.12


class CostConfigResponse(BaseModel):
    id: UUID
    name: str
    is_default: bool
    # OPEX fixos
    energy_cost_per_kwh: float
    demand_cost: float
    internet_monthly: float
    backend_monthly: float
    preventive_maintenance: float
    corrective_maintenance: float
    rent: float
    insurance: float
    admin_costs: float
    # OPEX variáveis
    payment_gateway_pct: float
    default_rate_pct: float
    # Split
    revenue_split_pct: float
    revenue_split_base: str
    # Impostos
    tax_rate_pct: float
    tax_base: str
    # Parâmetros financeiros
    depreciation_years: int
    discount_rate_annual: float
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UsageResponse(BaseModel):
    users_used: int
    users_limit: int
    files_used: int
    files_limit: int
    plan: str
    trial_ends_at: datetime | None
