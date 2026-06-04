"""
Cálculos de KPIs, DRE e analytics.

Migrado de eletropostos_dashboard.py — compute_kpis() e funções de DRE.
Opera sobre DataFrames pandas extraídos do banco de dados.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

import pandas as pd

# ─── Tipos auxiliares ─────────────────────────────────────────────────────────

@dataclass
class CostConfig:
    energy_cost_per_kwh: float = 0.75
    operational_cost_pct: float = 0.05
    platform_fee_pct: float = 0.03
    platform_fixed_monthly: float = 0.0
    tax_pct: float = 0.06
    maintenance_monthly: float = 0.0
    revenue_split_pct: float = 0.0
    depreciation_years: int = 5


# ─── KPIs ─────────────────────────────────────────────────────────────────────

def compute_kpis(df: pd.DataFrame) -> dict[str, Any]:
    """
    Recebe DataFrame com colunas normalizadas (vide file_processor.py)
    e retorna dict com todos os KPIs do dashboard.
    """
    if df.empty:
        return _empty_kpis()

    paid = df[df["is_paid"]].copy()

    energy = df[df["energy_kwh"] > 0]
    paid_energy = paid[paid["energy_kwh"] > 0]

    attempts = df["is_paid"].notna().sum()
    days = max(df["started_at"].dt.date.nunique(), 1)
    total_rev = paid["revenue_total"].sum()
    pending_rev = df[df["payment_status"] == "pending"]["revenue_total"].sum()

    user_counts = df.groupby("user_tag").size() if "user_tag" in df.columns else pd.Series(dtype=int)

    kwh_total = energy["energy_kwh"].sum()
    rev_per_kwh = (
        paid_energy["revenue_total"].sum() / paid_energy["energy_kwh"].sum()
        if paid_energy["energy_kwh"].sum() > 0
        else 0.0
    )

    power_users_tags = user_counts[user_counts >= 5].index if not user_counts.empty else []
    power_rev = paid[paid["user_tag"].isin(power_users_tags)]["revenue_total"].sum()

    idle_rev = df["revenue_idle"].sum()
    start_fee_rev = paid["revenue_start_fee"].sum()
    energy_rev = paid["revenue_energy"].sum()

    rejected = (df["payment_status"] == "rejected").sum()

    return {
        "total_sessions": len(df),
        "paid_sessions": len(paid),
        "revenue": float(total_rev),
        "pending_rev": float(pending_rev),
        "energy_kwh": float(kwh_total),
        "avg_kwh": float(energy["energy_kwh"].mean()) if len(energy) else 0.0,
        "avg_ticket": float(paid["revenue_total"].mean()) if len(paid) else 0.0,
        "rev_per_kwh": float(rev_per_kwh),
        "rev_per_day": float(total_rev / days),
        "kwh_per_day": float(kwh_total / days),
        "sessions_per_day": float(len(df) / days),
        "days": int(days),
        "conversion": float(len(paid) / attempts * 100) if attempts else 0.0,
        "approval": float(len(paid) / len(df) * 100) if len(df) else 0.0,
        "rejection_rate": float(rejected / max(attempts, 1) * 100),
        "unique_users": int(user_counts.shape[0]),
        "one_time": int((user_counts == 1).sum()) if not user_counts.empty else 0,
        "power_users": int((user_counts >= 5).sum()) if not user_counts.empty else 0,
        "power_rev_pct": float(power_rev / total_rev * 100) if total_rev else 0.0,
        "idle_rev": float(idle_rev),
        "idle_sessions": int((df["revenue_idle"] > 0).sum()),
        "start_fee_rev": float(start_fee_rev),
        "energy_rev": float(energy_rev),
        "proj_annual": float(total_rev / days * 365),
        "rejected_sessions": int(rejected),
    }


def _empty_kpis() -> dict[str, Any]:
    keys = [
        "total_sessions", "paid_sessions", "revenue", "pending_rev", "energy_kwh",
        "avg_kwh", "avg_ticket", "rev_per_kwh", "rev_per_day", "kwh_per_day",
        "sessions_per_day", "days", "conversion", "approval", "rejection_rate",
        "unique_users", "one_time", "power_users", "power_rev_pct", "idle_rev",
        "idle_sessions", "start_fee_rev", "energy_rev", "proj_annual", "rejected_sessions",
    ]
    return {k: 0 for k in keys}


# ─── Time series ──────────────────────────────────────────────────────────────

def daily_revenue(df: pd.DataFrame) -> list[dict]:
    """Retorna série diária de receita e sessões para o gráfico principal."""
    if df.empty:
        return []
    paid = df[df["is_paid"]].copy()
    paid["date"] = paid["started_at"].dt.date
    daily = paid.groupby("date").agg(
        revenue=("revenue_total", "sum"),
        sessions=("revenue_total", "count"),
        kwh=("energy_kwh", "sum"),
    ).reset_index()
    return [
        {
            "date": str(r["date"]),
            "revenue": float(r["revenue"]),
            "sessions": int(r["sessions"]),
            "kwh": float(r["kwh"]),
        }
        for _, r in daily.iterrows()
    ]


def monthly_revenue(df: pd.DataFrame) -> list[dict]:
    """Retorna série mensal de receita, sessões e kWh."""
    if df.empty:
        return []
    paid = df[df["is_paid"]].copy()
    paid["month"] = paid["started_at"].dt.to_period("M")
    monthly = paid.groupby("month").agg(
        revenue=("revenue_total", "sum"),
        sessions=("revenue_total", "count"),
        kwh=("energy_kwh", "sum"),
    ).reset_index()
    return [
        {
            "date": r["month"].to_timestamp().strftime("%Y-%m-%d"),
            "month": str(r["month"]),
            "revenue": float(r["revenue"]),
            "sessions": int(r["sessions"]),
            "kwh": float(r["kwh"]),
        }
        for _, r in monthly.iterrows()
    ]


def weekly_revenue(df: pd.DataFrame) -> list[dict]:
    """Retorna série semanal de receita e sessões."""
    if df.empty:
        return []
    paid = df[df["is_paid"]].copy()
    paid["week"] = paid["started_at"].dt.isocalendar().week.astype(int)
    paid["year"] = paid["started_at"].dt.isocalendar().year.astype(int)
    weekly = paid.groupby(["year", "week"]).agg(
        revenue=("revenue_total", "sum"),
        sessions=("revenue_total", "count"),
        kwh=("energy_kwh", "sum"),
    ).reset_index()
    result = []
    for _, r in weekly.iterrows():
        year, week = int(r["year"]), int(r["week"])
        week_start = date.fromisocalendar(year, week, 1)
        result.append({
            "date": week_start.isoformat(),
            "week": f"{year}-W{week:02d}",
            "revenue": float(r["revenue"]),
            "sessions": int(r["sessions"]),
            "kwh": float(r["kwh"]),
        })
    return result


def hourly_distribution(df: pd.DataFrame) -> list[dict]:
    """Retorna distribuição de sessões por hora do dia (0–23)."""
    if df.empty:
        return [{"hour": h, "sessions": 0, "revenue": 0.0} for h in range(24)]
    df = df.copy()
    df["hour"] = df["started_at"].dt.hour
    agg = df.groupby("hour").agg(
        sessions=("started_at", "count"),
        revenue=("revenue_total", "sum"),
    ).reindex(range(24), fill_value=0).reset_index()
    return [
        {"hour": int(r["hour"]), "sessions": int(r["sessions"]), "revenue": float(r["revenue"])}
        for _, r in agg.iterrows()
    ]


# ─── Estações ─────────────────────────────────────────────────────────────────

def station_ranking(df: pd.DataFrame, top_n: int = 15) -> list[dict]:
    """Top estações por receita."""
    if df.empty or "station_name" not in df.columns:
        return []
    paid = df[df["is_paid"]].copy()
    days = max(df["started_at"].dt.date.nunique(), 1)
    agg = (
        paid.groupby("station_name")
        .agg(revenue=("revenue_total", "sum"), sessions=("started_at", "count"), kwh=("energy_kwh", "sum"))
        .reset_index()
        .sort_values("revenue", ascending=False)
        .head(top_n)
    )
    return [
        {
            "station": r["station_name"],
            "revenue": float(r["revenue"]),
            "sessions": int(r["sessions"]),
            "sessions_per_day": float(r["sessions"] / days),
            "kwh": float(r["kwh"]),
        }
        for _, r in agg.iterrows()
    ]


def occupancy_rate(df: pd.DataFrame, operating_hours: int = 24, top_n: int = 15) -> list[dict]:
    """Taxa de ocupação por estação."""
    if df.empty or "station_name" not in df.columns:
        return []
    days = max(df["started_at"].dt.date.nunique(), 1)
    available_minutes = days * operating_hours * 60
    agg = (
        df.groupby("station_name")
        .agg(sessions=("started_at", "count"), total_min=("duration_minutes", "sum"))
        .assign(occupancy_pct=lambda x: (x["total_min"] / available_minutes * 100).clip(0, 100))
        .sort_values("occupancy_pct", ascending=False)
        .head(top_n)
        .reset_index()
    )
    return [
        {
            "station": r["station_name"],
            "occupancy_pct": float(r["occupancy_pct"]),
            "sessions": int(r["sessions"]),
            "total_minutes": float(r["total_min"]),
        }
        for _, r in agg.iterrows()
    ]


# ─── Usuários ─────────────────────────────────────────────────────────────────

def user_segmentation(df: pd.DataFrame) -> dict[str, Any]:
    """Segmenta usuários por frequência de uso."""
    if df.empty or "user_tag" not in df.columns:
        return {"segments": [], "by_revenue": []}

    user_stats = df.groupby("user_tag").agg(
        sessions=("started_at", "count"),
        revenue=("revenue_total", "sum"),
    )
    labels = ["1 sessão", "2–4", "5–9", "10+"]
    bins = [0, 1, 4, 9, float("inf")]

    segs = pd.cut(user_stats["sessions"], bins=bins, labels=labels)
    seg_count = user_stats.groupby(segs, observed=True).size()
    seg_rev = user_stats.groupby(segs, observed=True)["revenue"].sum()

    return {
        "segments": [
            {"label": label, "users": int(seg_count.get(label, 0)), "revenue": float(seg_rev.get(label, 0))}
            for label in labels
        ],
    }


# ─── Pagamentos ───────────────────────────────────────────────────────────────

def payment_breakdown(df: pd.DataFrame) -> dict[str, Any]:
    """Funil de conversão e breakdown por método de pagamento."""
    if df.empty:
        return {"funnel": [], "methods": []}

    paid_count = df["is_paid"].sum()
    rejected_count = (df["payment_status"] == "rejected").sum()
    total = len(df)
    attempts = paid_count + rejected_count

    funnel = [
        {"label": "Total de sessões", "value": int(total)},
        {"label": "Tentativas de pagamento", "value": int(attempts)},
        {"label": "Pagas (aprovadas)", "value": int(paid_count)},
    ]

    methods: list[dict] = []
    if "payment_method" in df.columns:
        paid = df[df["is_paid"]]
        method_agg = paid.groupby("payment_method").agg(
            sessions=("started_at", "count"),
            revenue=("revenue_total", "sum"),
        ).reset_index()
        methods = [
            {"method": r["payment_method"], "sessions": int(r["sessions"]), "revenue": float(r["revenue"])}
            for _, r in method_agg.iterrows()
        ]

    return {"funnel": funnel, "methods": methods}


def revenue_sources(df: pd.DataFrame) -> dict[str, Any]:
    """Breakdown das fontes de receita."""
    if df.empty:
        return {"start_fee": 0.0, "energy": 0.0, "idle": 0.0, "total": 0.0, "weekly": []}

    paid = df[df["is_paid"]].copy()
    start_fee = float(paid["revenue_start_fee"].sum())
    energy_rev = float(paid["revenue_energy"].sum())
    idle_rev = float(paid["revenue_idle"].sum())
    total = start_fee + energy_rev + idle_rev

    # Semanal
    paid["week"] = paid["started_at"].dt.isocalendar().week.astype(int)
    paid["year"] = paid["started_at"].dt.isocalendar().year.astype(int)
    weekly = paid.groupby(["year", "week"]).agg(
        start_fee=("revenue_start_fee", "sum"),
        energy=("revenue_energy", "sum"),
        idle=("revenue_idle", "sum"),
    ).reset_index()

    weekly_list = []
    for _, r in weekly.iterrows():
        year, week = int(r["year"]), int(r["week"])
        week_start = date.fromisocalendar(year, week, 1)
        weekly_list.append({
            "date": week_start.isoformat(),
            "week": f"{year}-W{week:02d}",
            "start_fee": float(r["start_fee"]),
            "energy": float(r["energy"]),
            "idle": float(r["idle"]),
        })

    return {
        "start_fee": start_fee,
        "energy": energy_rev,
        "idle": idle_rev,
        "total": total,
        "weekly": weekly_list,
    }


def connector_breakdown(df: pd.DataFrame) -> list[dict]:
    """Sessões e receita por tipo de conector."""
    if df.empty or "connector_type" not in df.columns:
        return []
    agg = df.groupby("connector_type").agg(
        sessions=("started_at", "count"),
        revenue=("revenue_total", "sum"),
        kwh=("energy_kwh", "sum"),
    ).reset_index()
    return [
        {
            "connector_type": r["connector_type"],
            "sessions": int(r["sessions"]),
            "revenue": float(r["revenue"]),
            "kwh": float(r["kwh"]),
        }
        for _, r in agg.iterrows()
    ]


def weekday_patterns(df: pd.DataFrame) -> list[dict]:
    """Receita e sessões por dia da semana."""
    if df.empty:
        return []
    DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]
    df = df.copy()
    df["dow"] = df["started_at"].dt.dayofweek
    paid = df[df["is_paid"]].copy()
    paid["dow"] = paid["started_at"].dt.dayofweek

    sessions = df.groupby("dow").size().reindex(range(7), fill_value=0)
    paid_sessions = paid.groupby("dow").size().reindex(range(7), fill_value=0)
    revenue = paid.groupby("dow")["revenue_total"].sum().reindex(range(7), fill_value=0)

    return [
        {
            "day": DAYS[i],
            "sessions": int(sessions[i]),
            "paid_sessions": int(paid_sessions[i]),
            "revenue": float(revenue[i]),
        }
        for i in range(7)
    ]


# ─── DRE ─────────────────────────────────────────────────────────────────────

def _period_label(period_start: date, granularity: str) -> str:
    if granularity == "weekly":
        return period_start.strftime("Sem %V/%y")
    if granularity == "monthly":
        return period_start.strftime("%b/%Y")
    if granularity == "quarterly":
        q = (period_start.month - 1) // 3 + 1
        return f"T{q}/{period_start.year}"
    return str(period_start)


def _group_key(dt: datetime, granularity: str):
    if granularity == "weekly":
        iso = dt.isocalendar()
        return date.fromisocalendar(int(iso.year), int(iso.week), 1)
    if granularity == "monthly":
        return date(dt.year, dt.month, 1)
    if granularity == "quarterly":
        q = (dt.month - 1) // 3
        return date(dt.year, q * 3 + 1, 1)
    return dt.date()


def compute_dre(
    df: pd.DataFrame,
    cost_config: CostConfig,
    granularity: str = "monthly",  # weekly | monthly | quarterly
) -> list[dict]:
    """
    Calcula o DRE por período.
    Retorna lista de dicts, um por período, com todas as linhas do DRE.
    """
    if df.empty:
        return []

    paid = df[df["is_paid"]].copy()
    paid["_period"] = paid["started_at"].apply(lambda dt: _group_key(dt, granularity))

    periods = sorted(paid["_period"].unique())
    rows = []

    for period in periods:
        p = paid[paid["_period"] == period]
        days_in_period = max(p["started_at"].dt.date.nunique(), 1)

        sessions = len(p)
        kwh = float(p["energy_kwh"].sum())
        gross_revenue = float(p["revenue_total"].sum())
        # Desconto de voucher: receita das sessões cobertas por voucher
        # (custo absorvido pela empresa — subtrai da receita líquida)
        voucher_discount = float(p[p["has_voucher"]]["revenue_total"].sum())
        net_revenue = gross_revenue - voucher_discount

        energy_cost = kwh * cost_config.energy_cost_per_kwh
        operational_cost = net_revenue * cost_config.operational_cost_pct
        platform_fee = net_revenue * cost_config.platform_fee_pct
        platform_fixed = cost_config.platform_fixed_monthly * (days_in_period / 30)
        tax = net_revenue * cost_config.tax_pct
        revenue_split = net_revenue * cost_config.revenue_split_pct
        maintenance = cost_config.maintenance_monthly * (days_in_period / 30)

        total_costs = energy_cost + operational_cost + platform_fee + platform_fixed + tax + revenue_split + maintenance

        ebitda = net_revenue - total_costs
        depreciation = 0.0  # calculado no payback, não aqui
        ebit = ebitda - depreciation

        rows.append({
            "period": _period_label(period, granularity),
            "period_start": period.isoformat(),
            "sessions": sessions,
            "kwh": round(kwh, 2),
            "gross_revenue": round(gross_revenue, 2),
            "voucher_discount": round(voucher_discount, 2),
            "net_revenue": round(net_revenue, 2),
            "energy_cost": round(energy_cost, 2),
            "operational_cost": round(operational_cost, 2),
            "platform_fee": round(platform_fee, 2),
            "platform_fixed": round(platform_fixed, 2),
            "tax": round(tax, 2),
            "revenue_split": round(revenue_split, 2),
            "maintenance": round(maintenance, 2),
            "total_costs": round(total_costs, 2),
            "ebitda": round(ebitda, 2),
            "ebitda_margin_pct": round(ebitda / net_revenue * 100, 1) if net_revenue else 0.0,
            "ebit": round(ebit, 2),
            "net_margin_pct": round(ebit / net_revenue * 100, 1) if net_revenue else 0.0,
        })

    return rows


# ─── Insights ─────────────────────────────────────────────────────────────────

def generate_insights(df: pd.DataFrame, kpis: dict) -> list[dict]:
    """Gera insights automáticos baseados nos dados."""
    insights = []

    # Conversão / reprovação
    if kpis.get("conversion", 0) < 70:
        insights.append({
            "type": "warning",
            "severity": "warning",
            "title": "Taxa de conversão baixa",
            "body": f"Taxa de aprovação de {kpis['conversion']:.1f}% indica oportunidade de melhoria no processo de pagamento.",
        })
    elif kpis.get("conversion", 0) >= 90:
        insights.append({
            "type": "success",
            "severity": "success",
            "title": "Excelente taxa de conversão",
            "body": f"Aprovação de {kpis['conversion']:.1f}% — sua integração de gateway está performando muito bem.",
        })

    # Taxa de reprovação
    if kpis.get("rejection_rate", 0) > 15:
        insights.append({
            "type": "warning",
            "severity": "warning",
            "title": "Alta taxa de reprovação de pagamento",
            "body": f"{kpis['rejection_rate']:.1f}% dos pagamentos não foram aprovados ({kpis.get('rejected_sessions', 0)} sessões). Verifique configuração do gateway.",
        })

    # Power users
    if kpis.get("power_rev_pct", 0) > 60:
        insights.append({
            "type": "info",
            "severity": "info",
            "title": "Alta concentração em power users",
            "body": f"Power users (5+ sessões) representam {kpis['power_rev_pct']:.1f}% da receita. Considere programa de fidelidade.",
        })

    # One-time users
    if kpis.get("unique_users", 0) > 0:
        one_time_pct = kpis.get("one_time", 0) / kpis["unique_users"] * 100
        if one_time_pct > 60:
            insights.append({
                "type": "info",
                "severity": "info",
                "title": "Maioria de usuários esporádicos",
                "body": f"{one_time_pct:.0f}% dos usuários carregaram apenas uma vez. Estratégias de retenção podem aumentar receita recorrente.",
            })

    # Ociosidade
    if kpis.get("idle_rev", 0) > 0:
        idle_pct = kpis["idle_rev"] / kpis["revenue"] * 100 if kpis.get("revenue") else 0
        insights.append({
            "type": "success",
            "severity": "success",
            "title": "Receita de ociosidade ativa",
            "body": f"R$ {kpis['idle_rev']:,.2f} em taxas de ociosidade ({idle_pct:.1f}% da receita).",
        })

    # Receita pendente
    if kpis.get("pending_rev", 0) > kpis.get("revenue", 1) * 0.1:
        insights.append({
            "type": "warning",
            "severity": "warning",
            "title": "Receita pendente elevada",
            "body": f"R$ {kpis['pending_rev']:,.2f} em pagamentos com status pending — verifique integração e inadimplência.",
        })

    # Eficiência energética
    rev_per_kwh = kpis.get("rev_per_kwh", 0)
    if rev_per_kwh > 0:
        if rev_per_kwh >= 2.0:
            insights.append({
                "type": "success",
                "severity": "success",
                "title": "Alta receita por kWh",
                "body": f"R$ {rev_per_kwh:.2f}/kWh médio — precificação otimizada e boa eficiência de monetização.",
            })
        elif rev_per_kwh < 1.0:
            insights.append({
                "type": "warning",
                "severity": "warning",
                "title": "Baixa receita por kWh",
                "body": f"R$ {rev_per_kwh:.2f}/kWh médio está abaixo do esperado. Revise a tabela de preços.",
            })

    # Projeção anual
    proj = kpis.get("proj_annual", 0)
    if proj > 0 and kpis.get("days", 0) >= 30:
        insights.append({
            "type": "info",
            "severity": "info",
            "title": "Projeção anual calculada",
            "body": f"Com base nos últimos {kpis['days']} dias, a receita anual projetada é de R$ {proj:,.0f}.",
        })

    # Sessões por dia
    spd = kpis.get("sessions_per_day", 0)
    if spd > 0 and spd < 2 and kpis.get("days", 0) >= 14:
        insights.append({
            "type": "warning",
            "severity": "warning",
            "title": "Baixa utilização diária",
            "body": f"Média de {spd:.1f} sessões/dia. Avalie campanhas de divulgação ou ajuste de localização dos pontos.",
        })

    # Concentração de receita por horário
    if not df.empty:
        df_copy = df[df["is_paid"]].copy()
        if len(df_copy) > 0:
            df_copy["hour"] = df_copy["started_at"].dt.hour
            peak_hour = df_copy.groupby("hour")["revenue_total"].sum().idxmax()
            peak_rev_pct = (
                df_copy[df_copy["hour"] == peak_hour]["revenue_total"].sum()
                / df_copy["revenue_total"].sum() * 100
            )
            if peak_rev_pct > 20:
                insights.append({
                    "type": "info",
                    "severity": "info",
                    "title": f"Pico de receita às {int(peak_hour)}h",
                    "body": f"{peak_rev_pct:.0f}% da receita se concentra nessa hora. Considere preços dinâmicos para redistribuir demanda.",
                })

    return insights


# ─── Análise aprofundada de usuários ─────────────────────────────────────────

def user_deep_analysis(df: pd.DataFrame) -> dict[str, Any]:
    """Top users, voucher behavior, user base evolution, churn."""
    EMPTY = {"top_users": [], "voucher": {"total_sessions": 0, "total_users": 0, "retained_users": 0, "retention_rate": 0.0, "by_segment": []}, "evolution": {"weekly": [], "monthly": [], "quarterly": []}}
    if df.empty or "user_tag" not in df.columns:
        return EMPTY

    df = df.copy()
    df["started_at"] = pd.to_datetime(df["started_at"])

    paid = df[df["is_paid"]].copy()
    has_voucher_col = "has_voucher" in df.columns

    # ── Top 20 users ──────────────────────────────────────────────────────────
    user_stats = paid.groupby("user_tag").agg(
        sessions=("started_at", "count"),
        revenue=("revenue_total", "sum"),
        avg_duration=("duration_minutes", "mean"),
        kwh=("energy_kwh", "sum"),
        voucher_sessions=("has_voucher", "sum") if has_voucher_col else ("started_at", lambda _: 0),
    ).reset_index()

    all_sessions = df.groupby("user_tag").size().rename("total_sessions")
    user_stats = user_stats.join(all_sessions, on="user_tag", how="left").fillna(0)
    user_stats["avg_ticket"] = user_stats["revenue"] / user_stats["sessions"].clip(lower=1)
    user_stats["voucher_pct"] = user_stats["voucher_sessions"] / user_stats["sessions"].clip(lower=1) * 100

    # Resolve user_name per tag (last non-null value)
    has_name_col = "user_name" in df.columns
    if has_name_col:
        name_map = (
            df[df["user_name"].notna()]
            .sort_values("started_at")
            .groupby("user_tag")["user_name"]
            .last()
        )
        user_stats = user_stats.join(name_map, on="user_tag", how="left")
    else:
        user_stats["user_name"] = None

    top = user_stats.nlargest(20, "sessions")
    top_users = [
        {
            "user_name": str(r["user_name"]) if pd.notna(r["user_name"]) else None,
            "user_tag": str(r["user_tag"]),
            "display_label": str(r["user_name"]) if pd.notna(r["user_name"]) else str(r["user_tag"])[:14],
            "sessions": int(r["sessions"]),
            "revenue": round(float(r["revenue"]), 2),
            "avg_ticket": round(float(r["avg_ticket"]), 2),
            "avg_duration": round(float(r["avg_duration"]), 1),
            "kwh": round(float(r["kwh"]), 1),
            "voucher_sessions": int(r["voucher_sessions"]),
            "voucher_pct": round(float(r["voucher_pct"]), 1),
        }
        for _, r in top.iterrows()
    ]

    # ── Voucher analysis ──────────────────────────────────────────────────────
    if has_voucher_col:
        voucher_df = df[df["has_voucher"]]
        total_voucher_sessions = int(len(voucher_df))
        voucher_users = set(voucher_df["user_tag"].dropna().unique())
        total_voucher_users = len(voucher_users)

        retained = 0
        for u in voucher_users:
            udf = df[df["user_tag"] == u].sort_values("started_at")
            first_v = udf[udf["has_voucher"]]["started_at"].min()
            back = udf[(udf["started_at"] > first_v) & (~udf["has_voucher"])]
            if len(back) > 0:
                retained += 1

        retention_rate = round(retained / total_voucher_users * 100, 1) if total_voucher_users else 0.0

        all_u = df.groupby("user_tag").agg(
            total_s=("started_at", "count"),
            v_s=("has_voucher", "sum"),
        ).reset_index()

        def _seg(n: int) -> str:
            if n == 1:
                return "1 sessão"
            if n <= 4:
                return "2–4"
            if n <= 9:
                return "5–9"
            return "10+"

        ORDER = ["1 sessão", "2–4", "5–9", "10+"]
        all_u["seg"] = all_u["total_s"].apply(_seg)
        seg_agg = all_u.groupby("seg").agg(
            total_users=("user_tag", "count"),
            users_with_voucher=("v_s", lambda x: (x > 0).sum()),
            voucher_sessions=("v_s", "sum"),
        ).reset_index()
        seg_agg["_ord"] = seg_agg["seg"].apply(lambda s: ORDER.index(s) if s in ORDER else 99)
        seg_agg = seg_agg.sort_values("_ord")

        by_segment = [
            {
                "segment": r["seg"],
                "total_users": int(r["total_users"]),
                "users_with_voucher": int(r["users_with_voucher"]),
                "voucher_sessions": int(r["voucher_sessions"]),
                "voucher_pct": round(r["users_with_voucher"] / r["total_users"] * 100, 1) if r["total_users"] > 0 else 0.0,
            }
            for _, r in seg_agg.iterrows()
        ]
    else:
        total_voucher_sessions = total_voucher_users = retained = 0
        retention_rate = 0.0
        by_segment = []

    # ── User base evolution ───────────────────────────────────────────────────
    def _evolution(df_in: pd.DataFrame, period_col: str, label_fn) -> list[dict]:
        groups = df_in.sort_values("started_at").groupby(period_col)
        rows = []
        seen: set = set()
        prev: set = set()
        for period, grp in groups:
            users = set(grp["user_tag"].dropna().unique())
            new = len(users - seen)
            returning = len(users & seen)
            churned = len(prev - users)
            churn_rate = round(churned / len(prev) * 100, 1) if prev else 0.0
            seen |= users
            rows.append({
                "period": label_fn(period),
                "active": len(users),
                "new": new,
                "returning": returning,
                "churned": churned,
                "churn_rate": churn_rate,
            })
            prev = users
        return rows

    df["_wk"] = df["started_at"].dt.to_period("W").apply(lambda p: p.start_time.date().isoformat())
    df["_mo"] = df["started_at"].dt.to_period("M").apply(lambda p: p.start_time.strftime("%b/%Y"))
    df["_qt"] = df["started_at"].apply(
        lambda dt: f"T{(dt.month - 1) // 3 + 1}/{dt.year}"
    )

    weekly_ev  = _evolution(df, "_wk", lambda p: p)
    monthly_ev = _evolution(df, "_mo", lambda p: p)
    qtrly_ev   = _evolution(df, "_qt", lambda p: p)

    return {
        "top_users": top_users,
        "voucher": {
            "total_sessions": total_voucher_sessions,
            "total_users": total_voucher_users,
            "retained_users": retained,
            "retention_rate": retention_rate,
            "by_segment": by_segment,
        },
        "evolution": {
            "weekly": weekly_ev,
            "monthly": monthly_ev,
            "quarterly": qtrly_ev,
        },
    }


# ─── Churn de estações ───────────────────────────────────────────────────────

def station_churn(df: pd.DataFrame, threshold_pct: float = 30.0) -> list[dict]:
    """Estações com queda de sessões MoM > threshold_pct% no período disponível."""
    if df.empty or "station_name" not in df.columns:
        return []

    df = df.copy()
    df["month"] = df["started_at"].dt.to_period("M")
    months = sorted(df["month"].unique())
    if len(months) < 2:
        return []

    prev_month, curr_month = months[-2], months[-1]
    prev_counts = df[df["month"] == prev_month].groupby("station_name").size().rename("prev_sessions")
    curr_counts = df[df["month"] == curr_month].groupby("station_name").size().rename("curr_sessions")

    merged = prev_counts.to_frame().join(curr_counts, how="outer").fillna(0)
    merged["change_pct"] = (
        (merged["curr_sessions"] - merged["prev_sessions"]) / merged["prev_sessions"].clip(lower=1) * 100
    )

    churned = (
        merged[(merged["prev_sessions"] > 0) & (merged["change_pct"] <= -threshold_pct)]
        .sort_values("change_pct")
        .reset_index()
    )

    return [
        {
            "station": r["station_name"],
            "prev_sessions": int(r["prev_sessions"]),
            "curr_sessions": int(r["curr_sessions"]),
            "change_pct": round(float(r["change_pct"]), 1),
            "prev_month": str(prev_month),
            "curr_month": str(curr_month),
        }
        for _, r in churned.iterrows()
    ]


# ─── Heatmap dia × hora ───────────────────────────────────────────────────────

def session_heatmap(df: pd.DataFrame) -> list[dict]:
    """Matriz 7×24 de contagens de sessões por dia da semana × hora do dia."""
    if df.empty:
        return []

    df = df.copy()
    df["weekday"] = df["started_at"].dt.dayofweek  # 0=Segunda, 6=Domingo
    df["hour"] = df["started_at"].dt.hour

    agg = df.groupby(["weekday", "hour"]).size().reset_index(name="sessions")

    return [
        {"weekday": int(r["weekday"]), "hour": int(r["hour"]), "sessions": int(r["sessions"])}
        for _, r in agg.iterrows()
    ]


# ─── Duração de sessões ───────────────────────────────────────────────────────

def session_duration_stats(df: pd.DataFrame) -> dict[str, Any]:
    """Distribuição de duração das sessões e ticket médio por faixa."""
    if df.empty or "duration_minutes" not in df.columns:
        return {"avg_duration": 0.0, "median_duration": 0.0, "buckets": []}

    d = df[df["duration_minutes"] > 0].copy()
    if d.empty:
        return {"avg_duration": 0.0, "median_duration": 0.0, "buckets": []}

    avg_duration = float(d["duration_minutes"].mean())
    median_duration = float(d["duration_minutes"].median())

    BINS = [0, 15, 30, 60, 90, 120, 180, float("inf")]
    LABELS = ["0–15 min", "15–30 min", "30–60 min", "60–90 min", "90–120 min", "120–180 min", "180+ min"]

    d["_bucket"] = pd.cut(d["duration_minutes"], bins=BINS, labels=LABELS, right=True)
    paid_d = d[d["is_paid"]].copy()

    sessions_by_bucket = d.groupby("_bucket", observed=True).size().rename("sessions")
    ticket_by_bucket = paid_d.groupby("_bucket", observed=True)["revenue_total"].mean().rename("avg_ticket")
    kwh_by_bucket = paid_d.groupby("_bucket", observed=True)["energy_kwh"].mean().rename("avg_kwh")

    result = (
        sessions_by_bucket
        .to_frame()
        .join(ticket_by_bucket, how="left")
        .join(kwh_by_bucket, how="left")
        .fillna(0)
        .reset_index()
    )

    return {
        "avg_duration": round(avg_duration, 1),
        "median_duration": round(median_duration, 1),
        "buckets": [
            {
                "label": str(r["_bucket"]),
                "sessions": int(r["sessions"]),
                "avg_ticket": round(float(r["avg_ticket"]), 2),
                "avg_kwh": round(float(r["avg_kwh"]), 2),
            }
            for _, r in result.iterrows()
        ],
    }
