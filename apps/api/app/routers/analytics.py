"""
Endpoints de analytics — todos os dados do dashboard financeiro.
Queries no banco → pandas → services/analytics.py → JSON.
"""

import contextlib
import pickle
from datetime import date

import pandas as pd
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.analytics_cache import DF_CACHE_TTL, df_cache_key, get_version
from app.core.database import get_db
from app.core.deps import CurrentUser
from app.core.redis import get_redis_bin
from app.models.charging_session import ChargingSession
from app.models.cost_configuration import CostConfiguration
from app.models.organization import Organization
from app.services import analytics
from app.services.analytics import CostConfig

router = APIRouter()


async def _get_org_tz(organization_id, db: AsyncSession) -> str:
    """Retorna o timezone configurado da organização (fallback: America/Sao_Paulo)."""
    org = await db.get(Organization, organization_id)
    if org and org.settings:
        return org.settings.get("timezone", "America/Sao_Paulo") or "America/Sao_Paulo"
    return "America/Sao_Paulo"


async def _load_df(
    organization_id,
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
    file_ids: list[str] | None = None,
    stations: list[str] | None = None,
    connectors: list[str] | None = None,
) -> pd.DataFrame:
    """Carrega o DataFrame de sessões com cache em Redis.

    Como TODOS os endpoints de analytics passam por aqui, cachear neste ponto
    elimina as múltiplas cargas completas da tabela quando o dashboard dispara
    vários endpoints com os mesmos filtros (ex.: a Visão Geral). O DataFrame é
    serializado com pickle (preserva dtypes) num Redis binário, com TTL curto, e
    invalidado por versão da org (incrementada ao alterar os dados de sessão).
    """
    version = await get_version(organization_id)
    key = df_cache_key(
        organization_id,
        version,
        date_from=date_from,
        date_to=date_to,
        file_ids=sorted(file_ids) if file_ids else None,
        stations=sorted(stations) if stations else None,
        connectors=sorted(connectors) if connectors else None,
    )
    rbin = get_redis_bin()
    with contextlib.suppress(Exception):
        cached = await rbin.get(key)
        if cached is not None:
            return pickle.loads(cached)

    df = await _load_df_uncached(
        organization_id, db, date_from, date_to, file_ids, stations, connectors
    )
    with contextlib.suppress(Exception):
        await rbin.set(key, pickle.dumps(df), ex=DF_CACHE_TTL)
    return df


async def _load_df_uncached(
    organization_id,
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
    file_ids: list[str] | None = None,
    stations: list[str] | None = None,
    connectors: list[str] | None = None,
) -> pd.DataFrame:
    """Carrega charging_sessions do banco e retorna como DataFrame no timezone da org."""
    q = select(ChargingSession).where(ChargingSession.organization_id == organization_id)

    if date_from:
        q = q.where(ChargingSession.started_at >= date_from)
    if date_to:
        q = q.where(ChargingSession.started_at <= date_to)
    if file_ids:
        q = q.where(ChargingSession.file_id.in_(file_ids))
    if stations:
        q = q.where(ChargingSession.station_name.in_(stations))
    if connectors:
        q = q.where(ChargingSession.connector_type.in_(connectors))

    result = await db.execute(q)
    sessions = result.scalars().all()

    if not sessions:
        return pd.DataFrame()

    records = [
        {
            "started_at": s.started_at,
            "ended_at": s.ended_at,
            "duration_minutes": s.duration_minutes,
            "station_name": s.station_name,
            "connector_type": s.connector_type,
            "user_name": s.user_name,
            "user_tag": s.user_tag,
            "revenue_total": float(s.revenue_total or 0),
            "revenue_start_fee": float(s.revenue_start_fee or 0),
            "revenue_energy": float(s.revenue_energy or 0),
            "revenue_idle": float(s.revenue_idle or 0),
            "energy_kwh": float(s.energy_kwh or 0),
            "payment_status": s.payment_status,
            "payment_method": s.payment_method,
            "is_paid": s.is_paid,
            "has_voucher": s.has_voucher,
        }
        for s in sessions
    ]
    df = pd.DataFrame(records)
    if "started_at" in df.columns:
        tz = await _get_org_tz(organization_id, db)
        # Converte UTC → fuso local e remove tzinfo: todos os .dt.hour/.dt.date
        # nas funções de analytics passam a operar no horário local da organização.
        df["started_at"] = (
            pd.to_datetime(df["started_at"], utc=True).dt.tz_convert(tz).dt.tz_localize(None)
        )
    return df


async def _load_cost_config(
    cost_config_id: str | None, organization_id, db: AsyncSession
) -> CostConfig:
    if cost_config_id:
        cfg = await db.get(CostConfiguration, cost_config_id)
        if cfg and str(cfg.organization_id) == str(organization_id):
            return CostConfig(
                energy_cost_per_kwh=cfg.energy_cost_per_kwh,
                operational_cost_pct=cfg.operational_cost_pct,
                platform_fee_pct=cfg.platform_fee_pct,
                platform_fixed_monthly=cfg.platform_fixed_monthly,
                tax_pct=cfg.tax_pct,
                maintenance_monthly=cfg.maintenance_monthly,
                revenue_split_pct=cfg.revenue_split_pct,
                depreciation_years=cfg.depreciation_years,
            )
    return CostConfig()


# ─── Filter params helper ─────────────────────────────────────────────────────


def _filter_params(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    files: list[str] | None = Query(None),
    stations: list[str] | None = Query(None),
    connectors: list[str] | None = Query(None),
):
    return {
        "date_from": date_from,
        "date_to": date_to,
        "file_ids": files,
        "stations": stations,
        "connectors": connectors,
    }


# ─── Endpoints ────────────────────────────────────────────────────────────────


@router.get(
    "/kpis", summary="KPIs principais do dashboard (receita, sessões, kWh, conversão, etc.)"
)
async def get_kpis(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    filters: dict = Depends(_filter_params),
):
    df = await _load_df(current_user.organization_id, db, **filters)
    return analytics.compute_kpis(df)


@router.get("/timeseries", summary="Série temporal de receita (daily | weekly | monthly)")
async def get_timeseries(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    filters: dict = Depends(_filter_params),
    granularity: str = Query("daily", pattern="^(daily|weekly|monthly)$"),
):
    df = await _load_df(current_user.organization_id, db, **filters)
    if granularity == "weekly":
        return analytics.weekly_revenue(df)
    if granularity == "monthly":
        return analytics.monthly_revenue(df)
    return analytics.daily_revenue(df)


@router.get("/hourly", summary="Distribuição de sessões e receita por hora do dia (0-23h)")
async def get_hourly(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    filters: dict = Depends(_filter_params),
):
    df = await _load_df(current_user.organization_id, db, **filters)
    return analytics.hourly_distribution(df)


@router.get("/stations", summary="Ranking de estações: receita, sessões, kWh e taxa de ocupação")
async def get_stations(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    filters: dict = Depends(_filter_params),
    top_n: int = Query(15, ge=1, le=50),
    operating_hours: float = Query(24.0, ge=0.5, le=24.0),
):
    df = await _load_df(current_user.organization_id, db, **filters)
    return {
        "ranking": analytics.station_ranking(df, top_n),
        "occupancy": analytics.occupancy_rate(df, operating_hours, top_n),
    }


@router.get("/users", summary="Segmentação de usuários: únicos, power users, frequência de recarga")
async def get_users(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    filters: dict = Depends(_filter_params),
):
    df = await _load_df(current_user.organization_id, db, **filters)
    return analytics.user_segmentation(df)


@router.get(
    "/payments", summary="Breakdown de pagamentos: funil, métodos (PagBank, carteira, voucher)"
)
async def get_payments(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    filters: dict = Depends(_filter_params),
):
    df = await _load_df(current_user.organization_id, db, **filters)
    return analytics.payment_breakdown(df)


@router.get(
    "/revenue-sources", summary="Fontes de receita: energy charge, start fee, idle fee por semana"
)
async def get_revenue_sources(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    filters: dict = Depends(_filter_params),
):
    df = await _load_df(current_user.organization_id, db, **filters)
    return analytics.revenue_sources(df)


@router.get("/connectors", summary="Desempenho por tipo de conector (AC 7,4kW / DC 60kW / etc.)")
async def get_connectors(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    filters: dict = Depends(_filter_params),
):
    df = await _load_df(current_user.organization_id, db, **filters)
    return analytics.connector_breakdown(df)


@router.get("/weekdays", summary="Padrão de sessões por dia da semana (seg–dom)")
async def get_weekdays(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    filters: dict = Depends(_filter_params),
):
    df = await _load_df(current_user.organization_id, db, **filters)
    return analytics.weekday_patterns(df)


@router.get("/dre", summary="DRE automático: receita, OPEX, EBITDA, lucro líquido por período")
async def get_dre(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    filters: dict = Depends(_filter_params),
    granularity: str = Query("monthly", pattern="^(weekly|monthly|quarterly)$"),
    cost_config_id: str | None = Query(None),
):
    df = await _load_df(current_user.organization_id, db, **filters)
    cost_cfg = await _load_cost_config(cost_config_id, current_user.organization_id, db)
    return analytics.compute_dre(df, cost_cfg, granularity)


@router.get(
    "/insights", summary="Insights automáticos gerados sobre anomalias e tendências dos KPIs"
)
async def get_insights(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    filters: dict = Depends(_filter_params),
):
    df = await _load_df(current_user.organization_id, db, **filters)
    kpis = analytics.compute_kpis(df)
    return analytics.generate_insights(df, kpis)


@router.get(
    "/users-deep",
    summary="Análise profunda de usuários: recência, frequência, LTV (RFM simplificado)",
)
async def get_users_deep(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    filters: dict = Depends(_filter_params),
):
    df = await _load_df(current_user.organization_id, db, **filters)
    return analytics.user_deep_analysis(df)


@router.get(
    "/session-duration", summary="Estatísticas de duração de sessão: média, percentis, distribuição"
)
async def get_session_duration(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    filters: dict = Depends(_filter_params),
):
    df = await _load_df(current_user.organization_id, db, **filters)
    return analytics.session_duration_stats(df)


@router.get(
    "/stations/churn", summary="Estações com queda de uso abaixo de um limiar configurável (%)"
)
async def get_station_churn(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    filters: dict = Depends(_filter_params),
    threshold: float = Query(30.0, ge=1.0, le=100.0),
):
    df = await _load_df(current_user.organization_id, db, **filters)
    return analytics.station_churn(df, threshold)


@router.get(
    "/stations/{station_name}/detail",
    summary="Detalhamento de uma estação: série diária, top usuários e conectores",
)
async def get_station_detail(
    station_name: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    filters: dict = Depends(_filter_params),
):
    """Detalhamento de uma estação específica: série diária, top usuários, conectores."""
    # Override station filter to this specific station only
    detail_filters = {**filters, "stations": [station_name]}
    df = await _load_df(current_user.organization_id, db, **detail_filters)
    if df.empty:
        return {"timeseries": [], "top_users": [], "connectors": [], "kpis": {}}

    kpis = analytics.compute_kpis(df)
    timeseries = analytics.daily_revenue(df)
    connectors = analytics.connector_breakdown(df)

    # Top 10 users for this station
    grp = (
        df[df["is_paid"]]
        .groupby("user_tag")
        .agg(
            sessions=("revenue_total", "count"),
            revenue=("revenue_total", "sum"),
            kwh=("energy_kwh", "sum"),
            avg_duration=("duration_minutes", "mean"),
            user_name=("user_name", "first"),
        )
        .reset_index()
        .sort_values("sessions", ascending=False)
        .head(10)
    )
    top_users = [
        {
            "user_tag": row["user_tag"],
            "user_name": row["user_name"],
            "sessions": int(row["sessions"]),
            "revenue": round(float(row["revenue"]), 2),
            "kwh": round(float(row["kwh"]), 1),
            "avg_duration": round(float(row["avg_duration"]), 0),
        }
        for _, row in grp.iterrows()
    ]
    return {
        "timeseries": timeseries,
        "top_users": top_users,
        "connectors": connectors,
        "kpis": kpis,
    }


@router.get(
    "/users/{user_tag}/detail",
    summary="Histórico completo de sessões e métricas de um usuário específico",
)
async def get_user_detail(
    user_tag: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    filters: dict = Depends(_filter_params),
):
    """Histórico de sessões e métricas para um usuário específico."""
    q = (
        select(ChargingSession)
        .where(ChargingSession.organization_id == current_user.organization_id)
        .where(ChargingSession.user_tag == user_tag)
    )
    if filters.get("date_from"):
        q = q.where(ChargingSession.started_at >= filters["date_from"])
    if filters.get("date_to"):
        q = q.where(ChargingSession.started_at <= filters["date_to"])
    result = await db.execute(q)
    sessions = result.scalars().all()
    if not sessions:
        return {"kpis": {}, "timeseries": [], "stations": [], "recent_sessions": []}

    records = [
        {
            "started_at": s.started_at,
            "station_name": s.station_name,
            "connector_type": s.connector_type,
            "user_name": s.user_name,
            "revenue_total": float(s.revenue_total or 0),
            "energy_kwh": float(s.energy_kwh or 0),
            "duration_minutes": s.duration_minutes,
            "payment_status": s.payment_status,
            "has_voucher": s.has_voucher,
            "is_paid": s.is_paid,
        }
        for s in sessions
    ]
    df = pd.DataFrame(records)
    _tz = await _get_org_tz(current_user.organization_id, db)
    df["started_at"] = (
        pd.to_datetime(df["started_at"], utc=True).dt.tz_convert(_tz).dt.tz_localize(None)
    )
    df["date"] = df["started_at"].dt.date

    kpis = {
        "total_sessions": len(df),
        "paid_sessions": int(df["is_paid"].sum()),
        "revenue": round(float(df.loc[df["is_paid"], "revenue_total"].sum()), 2),
        "kwh": round(float(df["energy_kwh"].sum()), 1),
        "avg_ticket": round(
            float(df.loc[df["is_paid"], "revenue_total"].mean() if df["is_paid"].any() else 0), 2
        ),
        "avg_duration": round(float(df["duration_minutes"].mean()), 0),
        "voucher_pct": round(float(df["has_voucher"].mean() * 100), 1),
        "user_name": sessions[0].user_name or user_tag,
    }

    # Daily revenue
    daily = (
        df[df["is_paid"]]
        .groupby("date")
        .agg(revenue=("revenue_total", "sum"), sessions=("revenue_total", "count"))
        .reset_index()
        .sort_values("date")
    )
    timeseries = [
        {
            "date": str(r["date"]),
            "revenue": round(float(r["revenue"]), 2),
            "sessions": int(r["sessions"]),
        }
        for _, r in daily.iterrows()
    ]

    # Top stations
    stn = (
        df.groupby("station_name")
        .agg(sessions=("revenue_total", "count"), revenue=("revenue_total", "sum"))
        .reset_index()
        .sort_values("sessions", ascending=False)
        .head(10)
    )
    stations = [
        {
            "station": r["station_name"],
            "sessions": int(r["sessions"]),
            "revenue": round(float(r["revenue"]), 2),
        }
        for _, r in stn.iterrows()
    ]

    # 20 most recent sessions
    recent = df.sort_values("started_at", ascending=False).head(20)[
        [
            "started_at",
            "station_name",
            "revenue_total",
            "energy_kwh",
            "duration_minutes",
            "payment_status",
            "has_voucher",
        ]
    ]
    recent_sessions = [
        {
            "date": r["started_at"].strftime("%Y-%m-%d %H:%M"),
            "station": r["station_name"],
            "revenue": round(float(r["revenue_total"]), 2),
            "kwh": round(float(r["energy_kwh"]), 1),
            "duration_min": int(r["duration_minutes"] or 0),
            "status": r["payment_status"],
            "voucher": bool(r["has_voucher"]),
        }
        for _, r in recent.iterrows()
    ]
    return {
        "kpis": kpis,
        "timeseries": timeseries,
        "stations": stations,
        "recent_sessions": recent_sessions,
    }


@router.get(
    "/forecast", summary="Previsão de receita: regressão linear com intervalo de confiança 95%"
)
async def get_forecast(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    filters: dict = Depends(_filter_params),
    horizon: int = Query(30, ge=7, le=90),
):
    """
    Previsão de receita para os próximos `horizon` dias via regressão linear simples
    sobre a série diária histórica.
    Retorna: historical (mesmos dados do timeseries daily) + forecast (datas futuras com intervalo de confiança).
    """
    from datetime import timedelta

    import numpy as np

    df = await _load_df(current_user.organization_id, db, **filters)
    if df.empty or len(df) < 7:
        return {"historical": [], "forecast": [], "r2": None}

    daily = analytics.daily_revenue(df)
    if len(daily) < 7:
        return {"historical": daily, "forecast": [], "r2": None}

    dates = [d["date"] for d in daily]
    revenues = np.array([d["revenue"] for d in daily], dtype=float)
    x = np.arange(len(revenues))

    # Linear regression: y = a*x + b
    a, b = np.polyfit(x, revenues, 1)
    y_pred = a * x + b
    ss_res = np.sum((revenues - y_pred) ** 2)
    ss_tot = np.sum((revenues - revenues.mean()) ** 2)
    r2 = float(1 - ss_res / ss_tot) if ss_tot > 0 else 0.0

    # Residual std for confidence interval (95% ≈ ±1.96σ)
    residual_std = float(np.std(revenues - y_pred))

    last_date = pd.to_datetime(dates[-1]).date()
    forecast = []
    for i in range(1, horizon + 1):
        xi = len(revenues) - 1 + i
        yhat = max(0.0, float(a * xi + b))
        margin = 1.96 * residual_std * (1 + i / len(revenues)) ** 0.5
        forecast.append(
            {
                "date": str(last_date + timedelta(days=i)),
                "revenue": round(yhat, 2),
                "lower": round(max(0.0, yhat - margin), 2),
                "upper": round(yhat + margin, 2),
            }
        )

    return {"historical": daily, "forecast": forecast, "r2": round(r2, 3)}


@router.get("/heatmap", summary="Heatmap hora × dia da semana de intensidade de sessões")
async def get_heatmap(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    filters: dict = Depends(_filter_params),
):
    df = await _load_df(current_user.organization_id, db, **filters)
    return analytics.session_heatmap(df)


@router.get("/cohort", summary="Análise de coorte mensal: retenção de usuários mês a mês")
async def get_cohort(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    filters: dict = Depends(_filter_params),
):
    """
    Análise de coorte mensal: agrupa usuários pelo mês do primeiro uso,
    mostra retenção (% que voltou) nos meses seguintes.
    Retorna: cohorts (lista de linhas), months (cabeçalhos das colunas).
    """
    df = await _load_df(current_user.organization_id, db, **filters)
    if df.empty:
        return {"cohorts": [], "months": []}

    df["started_at"] = pd.to_datetime(df["started_at"], utc=True)
    df["period"] = df["started_at"].dt.to_period("M")

    # First session month per user_tag
    first_period = (
        df.groupby("user_tag")["period"].min().reset_index().rename(columns={"period": "cohort"})
    )
    df = df.merge(first_period, on="user_tag")
    df["period_offset"] = (df["period"] - df["cohort"]).apply(lambda x: x.n)

    cohort_sizes = df.groupby("cohort")["user_tag"].nunique()
    retention = (
        df.groupby(["cohort", "period_offset"])["user_tag"]
        .nunique()
        .reset_index()
        .rename(columns={"user_tag": "users"})
    )

    all_cohorts = sorted(retention["cohort"].unique())
    max_offset = int(retention["period_offset"].max()) if not retention.empty else 0
    months = [f"M+{i}" for i in range(max_offset + 1)]

    cohorts_out = []
    for cohort in all_cohorts:
        size = int(cohort_sizes.get(cohort, 0))
        row: dict = {"cohort": str(cohort), "size": size, "retention": {}}
        for offset in range(max_offset + 1):
            val = retention[
                (retention["cohort"] == cohort) & (retention["period_offset"] == offset)
            ]
            if not val.empty and size > 0:
                row["retention"][f"M+{offset}"] = round(
                    float(val["users"].values[0]) / size * 100, 1
                )
            else:
                row["retention"][f"M+{offset}"] = None
        cohorts_out.append(row)

    return {"cohorts": cohorts_out, "months": months}
