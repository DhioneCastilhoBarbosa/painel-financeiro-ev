"""
Serviço de simulação simplificada de investimento em estações de recarga.
Usado pela API pública (landing page) para calcular retorno estimado.
"""
from __future__ import annotations

from typing import Any


def run_simulation(
    charger_type: str,
    num_chargers: int,
    config: dict[str, Any],
) -> dict[str, Any]:
    """
    Executa simulação simplificada de investimento.

    Args:
        charger_type: e.g. "DC 60 kW"
        num_chargers: número de pontos de recarga
        config: dicionário com campos do SimulatorConfig

    Returns:
        dict com métricas e projeção mensal
    """
    charger_configs: dict = config.get("charger_configs", {})
    charger = charger_configs.get(charger_type, {})

    if not charger:
        charger = {
            "price_brl": 50_000,
            "power_kw": 50.0,
            "avg_sessions_day": 5,
            "avg_duration_min": 40,
        }

    price_per_kwh: float = config.get("price_per_kwh", 0.85)
    opex_pct: float = config.get("opex_pct", 0.25)
    growth_pct_month: float = config.get("growth_pct_month", 0.03)
    discount_rate_annual: float = config.get("discount_rate_annual", 0.12)
    projection_years: int = config.get("projection_years", 5)

    # ── CAPEX ──────────────────────────────────────────────────────────────
    capex: float = charger["price_brl"] * num_chargers

    # ── Receita mensal base (mês 1) ─────────────────────────────────────────
    power_kw: float = charger["power_kw"]
    sessions_day: float = charger["avg_sessions_day"]
    duration_h: float = charger["avg_duration_min"] / 60.0

    kwh_per_session = power_kw * duration_h
    revenue_per_session = kwh_per_session * price_per_kwh
    monthly_sessions = sessions_day * 30 * num_chargers
    monthly_revenue_base = monthly_sessions * revenue_per_session
    monthly_opex_base = monthly_revenue_base * opex_pct
    monthly_net_base = monthly_revenue_base - monthly_opex_base

    # ── Projeção mensal ─────────────────────────────────────────────────────
    months = projection_years * 12
    discount_rate_monthly = (1 + discount_rate_annual) ** (1 / 12) - 1

    cumulative = -capex
    npv = -capex
    total_net_nominal = 0.0
    monthly_projections: list[dict] = []

    for m in range(1, months + 1):
        rev = monthly_revenue_base * ((1 + growth_pct_month) ** (m - 1))
        opex_m = rev * opex_pct
        net = rev - opex_m
        cumulative += net
        npv += net / ((1 + discount_rate_monthly) ** m)
        total_net_nominal += net

        if m <= 24:
            monthly_projections.append(
                {
                    "month": m,
                    "revenue": round(rev, 2),
                    "net": round(net, 2),
                    "cumulative": round(cumulative, 2),
                }
            )

    # ── Payback simples ─────────────────────────────────────────────────────
    payback_months: float | None = None
    payback_years: float | None = None
    if monthly_net_base > 0:
        payback_months = capex / monthly_net_base
        payback_years = payback_months / 12

    # ── ROI / TIR aproximada ────────────────────────────────────────────────
    roi_5y = ((total_net_nominal / capex) - 1) * 100 if capex > 0 else 0.0
    irr_approx = (roi_5y / 100) / projection_years if projection_years > 0 else 0.0

    return {
        "capex": round(capex, 2),
        "monthly_revenue": round(monthly_revenue_base, 2),
        "monthly_net": round(monthly_net_base, 2),
        "payback_months": round(payback_months, 1) if payback_months is not None else None,
        "payback_years": round(payback_years, 1) if payback_years is not None else None,
        "npv_5y": round(npv, 2),
        "irr_annual_pct": round(irr_approx * 100, 1),
        "roi_5y_pct": round(roi_5y, 1),
        "monthly_projections": monthly_projections,
        "charger_type": charger_type,
        "num_chargers": num_chargers,
        "sessions_per_month": int(monthly_sessions),
        "kwh_per_month": round(kwh_per_session * monthly_sessions, 0),
        "price_per_kwh": price_per_kwh,
    }


def run_simulation_multi(
    charger_items: list[dict[str, Any]],
    config: dict[str, Any],
) -> dict[str, Any]:
    """
    Executa simulação para um mix de tipos de carregador.

    Args:
        charger_items: lista de {"charger_type": str, "num_chargers": int}
        config: dicionário com campos do SimulatorConfig

    Returns:
        Mesmo formato de run_simulation, com métricas agregadas.
    """
    charger_configs: dict = config.get("charger_configs", {})
    price_per_kwh: float = config.get("price_per_kwh", 0.85)
    opex_pct: float = config.get("opex_pct", 0.25)
    growth_pct_month: float = config.get("growth_pct_month", 0.03)
    discount_rate_annual: float = config.get("discount_rate_annual", 0.12)
    projection_years: int = config.get("projection_years", 5)

    months = projection_years * 12
    discount_rate_monthly = (1 + discount_rate_annual) ** (1 / 12) - 1

    # Agrega valores base de todos os tipos
    total_capex = 0.0
    total_monthly_revenue_base = 0.0
    total_monthly_sessions = 0
    total_kwh_per_month = 0.0

    for item in charger_items:
        ct: str = item["charger_type"]
        n: int = item["num_chargers"]
        charger = charger_configs.get(ct, {
            "price_brl": 50_000,
            "power_kw": 50.0,
            "avg_sessions_day": 5,
            "avg_duration_min": 40,
        })

        kwh_session = charger["power_kw"] * (charger["avg_duration_min"] / 60.0)
        monthly_sessions = charger["avg_sessions_day"] * 30 * n
        monthly_rev = monthly_sessions * kwh_session * price_per_kwh

        total_capex += charger["price_brl"] * n
        total_monthly_revenue_base += monthly_rev
        total_monthly_sessions += monthly_sessions
        total_kwh_per_month += kwh_session * monthly_sessions

    total_monthly_net_base = total_monthly_revenue_base * (1 - opex_pct)

    # Payback simples
    payback_months: float | None = None
    payback_years: float | None = None
    if total_monthly_net_base > 0:
        payback_months = total_capex / total_monthly_net_base
        payback_years = payback_months / 12

    # Projeção mensal
    cumulative = -total_capex
    npv = -total_capex
    total_net_nominal = 0.0
    monthly_projections: list[dict] = []

    for m in range(1, months + 1):
        rev = total_monthly_revenue_base * ((1 + growth_pct_month) ** (m - 1))
        net = rev * (1 - opex_pct)
        cumulative += net
        npv += net / ((1 + discount_rate_monthly) ** m)
        total_net_nominal += net

        if m <= 24:
            monthly_projections.append({
                "month": m,
                "revenue": round(rev, 2),
                "net": round(net, 2),
                "cumulative": round(cumulative, 2),
            })

    roi_5y = ((total_net_nominal / total_capex) - 1) * 100 if total_capex > 0 else 0.0
    irr_approx = (roi_5y / 100) / projection_years if projection_years > 0 else 0.0

    # Rótulo resumido para o campo charger_type do banco (limite 50 chars)
    total_chargers = sum(item["num_chargers"] for item in charger_items)
    if len(charger_items) == 1:
        type_label = f"{charger_items[0]['charger_type']} ×{charger_items[0]['num_chargers']}"
    else:
        first = charger_items[0]["charger_type"]
        others = len(charger_items) - 1
        type_label = f"{first} +{others} tipo(s)"
    type_label = type_label[:50]

    # Descrição completa para exibição no frontend
    type_display = ", ".join(
        f"{item['charger_type']} ×{item['num_chargers']}" for item in charger_items
    )

    return {
        "capex": round(total_capex, 2),
        "monthly_revenue": round(total_monthly_revenue_base, 2),
        "monthly_net": round(total_monthly_net_base, 2),
        "payback_months": round(payback_months, 1) if payback_months is not None else None,
        "payback_years": round(payback_years, 1) if payback_years is not None else None,
        "npv_5y": round(npv, 2),
        "irr_annual_pct": round(irr_approx * 100, 1),
        "roi_5y_pct": round(roi_5y, 1),
        "monthly_projections": monthly_projections,
        "charger_type": type_display,
        "charger_type_label": type_label,
        "num_chargers": total_chargers,
        "sessions_per_month": total_monthly_sessions,
        "kwh_per_month": round(total_kwh_per_month, 0),
        "price_per_kwh": price_per_kwh,
    }
