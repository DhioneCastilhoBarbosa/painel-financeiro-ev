import secrets
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.custom_role import CustomRole
from app.models.organization import Organization
from app.models.payback_scenario import PaybackScenario
from app.models.user import UserRole
from app.services.payback import PaybackInputs, calculate

router = APIRouter()


class PaybackRequest(BaseModel):
    n_chargers: int = 1
    hardware_cost: float = 15000.0
    installation_cost: float = 5000.0
    installments: int = 1  # 1 = à vista; 2-10 = parcelado sem juros
    payment_mode: str = "upfront"  # kept for backward compat
    platform_fee_pct: float = 8.0
    platform_fixed_monthly: float = 50.0
    energy_cost_per_kwh: float = 0.75
    tax_pct: float = 6.0
    maintenance_monthly: float = 100.0
    revenue_split_pct: float = 0.0
    depreciation_years: int = 10
    discount_rate_annual: float = 12.0
    tariff_per_kwh: float = 1.80
    tariff_per_session: float = 0.0
    avg_kwh_per_session: float = 15.0
    avg_session_duration_min: float = 60.0
    operating_hours_per_day: float = 24.0
    portfolio_view: bool = False
    real_occupancy_pct: float | None = None


class SaveScenarioRequest(BaseModel):
    name: str
    inputs: dict
    results: dict


class ScenarioResponse(BaseModel):
    id: str
    name: str
    inputs: dict
    results: dict
    created_at: datetime
    updated_at: datetime
    share_token: str | None

    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def _id_to_str(cls, v: object) -> object:
        # SQLAlchemy returns a uuid.UUID for as_uuid=True columns; Pydantic v2
        # does not coerce UUID -> str automatically, which would raise a 500.
        return str(v) if v is not None else v

    @field_validator("inputs", "results", mode="before")
    @classmethod
    def _none_to_dict(cls, v: object) -> object:
        # Defensive: legacy rows may have NULL JSONB instead of {}.
        return v if v is not None else {}


class CrmScenarioResponse(BaseModel):
    id: str
    name: str
    org_name: str
    inputs: dict
    results: dict
    created_at: datetime
    updated_at: datetime

    @field_validator("id", mode="before")
    @classmethod
    def _id_to_str(cls, v: object) -> object:
        return str(v) if v is not None else v

    @field_validator("inputs", "results", mode="before")
    @classmethod
    def _none_to_dict(cls, v: object) -> object:
        return v if v is not None else {}


@router.post("/calculate")
async def calculate_payback(body: PaybackRequest):
    """Calcula payback — stateless, não persiste nada."""
    inputs = PaybackInputs(**body.model_dump())
    return calculate(inputs)


@router.get("/scenarios", response_model=list[ScenarioResponse])
async def list_scenarios(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PaybackScenario)
        .where(PaybackScenario.created_by == current_user.id)
        .order_by(PaybackScenario.updated_at.desc())
    )
    return result.scalars().all()


@router.post("/scenarios", response_model=ScenarioResponse, status_code=status.HTTP_201_CREATED)
async def save_scenario(
    body: SaveScenarioRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    # Limite de cenários por plano (org mãe não tem limite)
    from sqlalchemy import func

    org = await db.get(Organization, current_user.organization_id)
    if not org.is_mother:
        count = await db.scalar(
            select(func.count(PaybackScenario.id)).where(
                PaybackScenario.organization_id == current_user.organization_id
            )
        )
        limits = {"trial": 3, "starter": 3, "pro": 20, "enterprise": 9999}
        limit = limits.get(org.plan, 3)
        if count >= limit:
            raise HTTPException(
                status_code=403,
                detail=f"Limite de {limit} cenários atingido no plano {org.plan}",
            )

    scenario = PaybackScenario(
        id=str(uuid.uuid4()),
        organization_id=current_user.organization_id,
        created_by=current_user.id,
        name=body.name,
        inputs=body.inputs,
        results=body.results,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(scenario)
    await db.commit()
    await db.refresh(scenario)
    return scenario


@router.get("/scenarios/crm", response_model=list[CrmScenarioResponse])
async def list_crm_scenarios(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Cenários para o CRM — managers veem sua org; org mãe vê todas."""
    if current_user.role not in (UserRole.owner, UserRole.admin):
        if current_user.custom_role_id:
            cr = await db.get(CustomRole, current_user.custom_role_id)
            if not cr or not (cr.permissions.get("manage_leads") or cr.permissions.get("view_leads")):
                raise HTTPException(status_code=403, detail="Permissão insuficiente")
        else:
            raise HTTPException(status_code=403, detail="Permissão insuficiente")

    org = await db.get(Organization, current_user.organization_id)

    q = (
        select(PaybackScenario, Organization.name.label("org_name"))
        .join(Organization, PaybackScenario.organization_id == Organization.id)
        .order_by(PaybackScenario.updated_at.desc())
    )

    if not (org and org.is_mother):
        q = q.where(PaybackScenario.organization_id == current_user.organization_id)

    result = await db.execute(q)
    rows = result.all()
    return [
        CrmScenarioResponse(
            id=row.PaybackScenario.id,
            name=row.PaybackScenario.name,
            org_name=row.org_name,
            inputs=row.PaybackScenario.inputs,
            results=row.PaybackScenario.results,
            created_at=row.PaybackScenario.created_at,
            updated_at=row.PaybackScenario.updated_at,
        )
        for row in rows
    ]


@router.get("/scenarios/{scenario_id}", response_model=ScenarioResponse)
async def get_scenario(
    scenario_id: str, current_user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    sc = await _get_scenario_or_404(scenario_id, current_user.id, db)
    return sc


@router.put("/scenarios/{scenario_id}", response_model=ScenarioResponse)
async def update_scenario(
    scenario_id: str,
    body: SaveScenarioRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    sc = await _get_scenario_or_404(scenario_id, current_user.id, db)
    sc.name = body.name
    sc.inputs = body.inputs
    sc.results = body.results
    sc.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(sc)
    return sc


@router.delete("/scenarios/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scenario(
    scenario_id: str, current_user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    sc = await _get_scenario_or_404(scenario_id, current_user.id, db)
    await db.delete(sc)
    await db.commit()


@router.post("/scenarios/{scenario_id}/share")
async def share_scenario(
    scenario_id: str, current_user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    sc = await _get_scenario_or_404(scenario_id, current_user.id, db)
    if not sc.share_token:
        sc.share_token = secrets.token_urlsafe(24)
    return {"share_token": sc.share_token, "scenario_id": scenario_id}


@router.get("/shared/{share_token}")
async def get_shared_scenario(share_token: str, db: AsyncSession = Depends(get_db)):
    """Acesso público a cenário compartilhado — sem autenticação."""
    result = await db.execute(
        select(PaybackScenario).where(PaybackScenario.share_token == share_token)
    )
    sc = result.scalar_one_or_none()
    if not sc:
        raise HTTPException(status_code=404, detail="Cenário não encontrado")
    return {"name": sc.name, "inputs": sc.inputs, "results": sc.results}


async def _get_scenario_or_404(
    scenario_id: str, user_id, db: AsyncSession
) -> PaybackScenario:
    sc = await db.get(PaybackScenario, scenario_id)
    if not sc or str(sc.created_by) != str(user_id):
        raise HTTPException(status_code=404, detail="Cenário não encontrado")
    return sc
