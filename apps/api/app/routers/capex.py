"""
Router de CAPEX por Carregador.

Permite registrar o investimento (CAPEX, OPEX, impostos) por carregador ou grupo,
vinculando a uma estação dos dados de sessão para calcular payback real.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.charger_capex import ChargerCapex
from app.models.charging_session import ChargingSession
from app.schemas.capex import (
    CapexPerformance,
    ChargerCapexCreate,
    ChargerCapexResponse,
    ChargerCapexUpdate,
)

router = APIRouter()


# ─── Performance helper ───────────────────────────────────────────────────────

async def _compute_performance(
    rec: ChargerCapex,
    db: AsyncSession,
    org_id: uuid.UUID,
) -> CapexPerformance:
    """Calcula métricas reais usando dados de sessão ou estimativa manual."""

    installed_dt = datetime(
        rec.installed_at.year, rec.installed_at.month, rec.installed_at.day,
        tzinfo=UTC,
    )
    now = datetime.now(UTC)
    months_elapsed = max(0.0, (now - installed_dt).days / 30.44)

    revenue_total = 0.0
    monthly_revenue_avg = 0.0
    sessions_count = 0
    data_source = "none"

    if rec.station_key:
        # ── Receita real desde a instalação ──────────────────────────────────
        agg = await db.execute(
            select(
                func.coalesce(func.sum(ChargingSession.revenue_total), 0.0).label("rev"),
                func.count(ChargingSession.id).label("cnt"),
            ).where(
                ChargingSession.organization_id == org_id,
                ChargingSession.station_name == rec.station_key,
                ChargingSession.started_at >= installed_dt,
            )
        )
        row = agg.one()
        revenue_total = float(row.rev)
        sessions_count = int(row.cnt)
        data_source = "sessions"

        # Média mensal: últimos 90 dias
        cutoff_90d = datetime.now(UTC)
        cutoff_90d = cutoff_90d.replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        from datetime import timedelta
        cutoff_90d = cutoff_90d - timedelta(days=90)
        recent = await db.execute(
            select(func.coalesce(func.sum(ChargingSession.revenue_total), 0.0)).where(
                ChargingSession.organization_id == org_id,
                ChargingSession.station_name == rec.station_key,
                ChargingSession.started_at >= cutoff_90d,
            )
        )
        monthly_revenue_avg = float(recent.scalar_one()) / 3.0

    elif rec.monthly_revenue_est and months_elapsed > 0:
        # ── Estimativa manual ─────────────────────────────────────────────────
        monthly_revenue_avg = rec.monthly_revenue_est
        revenue_total = monthly_revenue_avg * months_elapsed
        data_source = "estimate"

    # ── Custo e lucro ─────────────────────────────────────────────────────────
    opex_total = revenue_total * rec.opex_pct
    tax_total  = revenue_total * rec.tax_pct
    net_total  = revenue_total - opex_total - tax_total
    cumulative = net_total - rec.capex_brl   # negativo = ainda em payback

    # ── Projeção de payback ───────────────────────────────────────────────────
    net_rate = monthly_revenue_avg * (1 - rec.opex_pct - rec.tax_pct)  # lucro/mês
    payback_months: float | None = None
    months_remaining: float | None = None
    progress_pct = 0.0

    if net_rate > 0:
        payback_months = rec.capex_brl / net_rate
        progress_pct = min(100.0, (net_total / rec.capex_brl) * 100) if rec.capex_brl > 0 else 0.0
        if cumulative >= 0:
            months_remaining = 0.0
            progress_pct = 100.0
        else:
            months_remaining = max(0.0, payback_months - months_elapsed)
    elif rec.capex_brl > 0 and net_total > 0:
        progress_pct = min(100.0, (net_total / rec.capex_brl) * 100)

    return CapexPerformance(
        months_elapsed=round(months_elapsed, 1),
        revenue_total=round(revenue_total, 2),
        monthly_revenue_avg=round(monthly_revenue_avg, 2),
        opex_total=round(opex_total, 2),
        tax_total=round(tax_total, 2),
        net_total=round(net_total, 2),
        cumulative=round(cumulative, 2),
        payback_months=round(payback_months, 1) if payback_months is not None else None,
        months_remaining=round(months_remaining, 1) if months_remaining is not None else None,
        progress_pct=round(progress_pct, 1),
        data_source=data_source,
        sessions_count=sessions_count,
    )


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[ChargerCapexResponse])
async def list_capex(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChargerCapex)
        .where(ChargerCapex.org_id == current_user.organization_id)
        .order_by(ChargerCapex.installed_at.desc())
    )
    records = result.scalars().all()

    out = []
    for rec in records:
        perf = await _compute_performance(rec, db, current_user.organization_id)
        out.append(ChargerCapexResponse.model_validate({**rec.__dict__, "performance": perf}))
    return out


@router.post("", response_model=ChargerCapexResponse, status_code=201)
async def create_capex(
    body: ChargerCapexCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    rec = ChargerCapex(
        id=uuid.uuid4(),
        org_id=current_user.organization_id,
        **body.model_dump(),
    )
    db.add(rec)
    await db.flush()
    perf = await _compute_performance(rec, db, current_user.organization_id)
    return ChargerCapexResponse.model_validate({**rec.__dict__, "performance": perf})


@router.put("/{capex_id}", response_model=ChargerCapexResponse)
async def update_capex(
    capex_id: str,
    body: ChargerCapexUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    rec = await db.get(ChargerCapex, capex_id)
    if not rec or rec.org_id != current_user.organization_id:
        raise HTTPException(status_code=404, detail="Registro não encontrado")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(rec, field, value)
    rec.updated_at = datetime.now(UTC)
    await db.flush()
    perf = await _compute_performance(rec, db, current_user.organization_id)
    return ChargerCapexResponse.model_validate({**rec.__dict__, "performance": perf})


@router.delete("/{capex_id}", status_code=204)
async def delete_capex(
    capex_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    rec = await db.get(ChargerCapex, capex_id)
    if not rec or rec.org_id != current_user.organization_id:
        raise HTTPException(status_code=404, detail="Registro não encontrado")
    await db.delete(rec)
