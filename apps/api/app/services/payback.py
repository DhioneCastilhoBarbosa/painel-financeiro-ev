"""
Calculadora de payback para investimento em carregadores EV.

Migrado de eletropostos_dashboard.py — render_payback() e funções _calc(), _npv_sc(), _irr_annual().
Totalmente stateless: recebe inputs, retorna resultados como dict JSON-serializável.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


# ─── Input schema ─────────────────────────────────────────────────────────────

@dataclass
class PaybackInputs:
    # Investimento
    n_chargers: int = 1
    hardware_cost: float = 15_000.0
    installation_cost: float = 5_000.0
    installments: int = 1  # 1 = à vista; 2-10 = parcelado sem juros
    # Legacy field kept for backward compat (ignored when installments is set)
    payment_mode: str = "upfront"

    # Custos operacionais
    platform_fee_pct: float = 8.0       # % da receita
    platform_fixed_monthly: float = 50.0  # R$/mês/unidade
    energy_cost_per_kwh: float = 0.75
    tax_pct: float = 6.0                # Simples Nacional %
    maintenance_monthly: float = 100.0   # R$/mês/unidade
    revenue_split_pct: float = 0.0       # % para o estabelecimento
    depreciation_years: int = 10
    discount_rate_annual: float = 12.0   # % a.a. (taxa de desconto / renda fixa)

    # Receita
    tariff_per_kwh: float = 1.80
    tariff_per_session: float = 0.0
    avg_kwh_per_session: float = 15.0
    avg_session_duration_min: float = 60.0
    operating_hours_per_day: float = 24.0

    # Modo de exibição
    portfolio_view: bool = False  # True = mostrar total; False = por unidade

    # Dados reais (opcional — overlay)
    real_occupancy_pct: float | None = None


# ─── Cálculo por cenário ──────────────────────────────────────────────────────

def _monthly_rate(annual_rate_pct: float) -> float:
    return (1 + annual_rate_pct / 100) ** (1 / 12) - 1


def _calc_scenario(inputs: PaybackInputs, occupancy_pct: float) -> dict[str, Any]:
    """Calcula um cenário de ocupação. Retorna métricas mensais e histórico de 20 anos."""
    mult = inputs.n_chargers if inputs.portfolio_view else 1
    inv_unit = inputs.hardware_cost + inputs.installation_cost
    inv_total = inv_unit * inputs.n_chargers
    inv_display = inv_total if inputs.portfolio_view else inv_unit
    inst_display = inputs.installation_cost * inputs.n_chargers if inputs.portfolio_view else inputs.installation_cost

    n_inst = max(1, inputs.installments)
    parcelado = n_inst > 1

    # Sessões por mês por unidade
    sessions_month = (inputs.operating_hours_per_day * 30 * 60 / max(inputs.avg_session_duration_min, 1)) * (occupancy_pct / 100)
    kwh_month = sessions_month * inputs.avg_kwh_per_session

    # Receita bruta
    gross_revenue = kwh_month * inputs.tariff_per_kwh + sessions_month * inputs.tariff_per_session

    # Deduções
    platform_fee = gross_revenue * inputs.platform_fee_pct / 100
    tax = gross_revenue * inputs.tax_pct / 100
    revenue_split = gross_revenue * inputs.revenue_split_pct / 100
    energy_cost = kwh_month * inputs.energy_cost_per_kwh
    fixed_platform = inputs.platform_fixed_monthly
    maintenance = inputs.maintenance_monthly

    # DRE mensal por unidade
    net_revenue = gross_revenue - revenue_split
    gross_profit = net_revenue - energy_cost
    ebitda = gross_profit - platform_fee - fixed_platform - maintenance
    depreciation = inv_unit / max(inputs.depreciation_years * 12, 1)
    ebit = ebitda - depreciation
    net_income = ebit - tax  # lucro líquido por unidade (aproximação)

    # Fluxo de caixa mensal livre (por unidade) — base para payback e VPL
    monthly_fcf = net_income

    # Histórico acumulado (20 anos = 240 meses)
    hist: list[float] = [-inst_display if parcelado else -inv_display]
    payback_months: int | None = None

    for month in range(1, 241):
        hw_installment = (inputs.hardware_cost / n_inst) * mult if parcelado and month <= n_inst else 0.0
        cash_in = monthly_fcf * mult
        hist.append(hist[-1] + cash_in - hw_installment)
        if payback_months is None and hist[-1] >= 0:
            payback_months = month

    # ROIC anual estimado
    roic_annual = (ebit * 12 / inv_unit * 100) if inv_unit > 0 else 0.0

    return {
        "occupancy_pct": occupancy_pct,
        "sessions_month": round(sessions_month * mult, 1),
        "kwh_month": round(kwh_month * mult, 2),
        "gross_revenue": round(gross_revenue * mult, 2),
        "net_revenue": round(net_revenue * mult, 2),
        "platform_fee": round(platform_fee * mult, 2),
        "tax": round(tax * mult, 2),
        "revenue_split": round(revenue_split * mult, 2),
        "energy_cost": round(energy_cost * mult, 2),
        "fixed_platform": round(fixed_platform * mult, 2),
        "maintenance": round(maintenance * mult, 2),
        "gross_profit": round(gross_profit * mult, 2),
        "ebitda": round(ebitda * mult, 2),
        "ebitda_margin_pct": round(ebitda / net_revenue * 100, 1) if net_revenue > 0 else 0.0,
        "depreciation": round(depreciation * mult, 2),
        "ebit": round(ebit * mult, 2),
        "net_income": round(net_income * mult, 2),
        "net_margin_pct": round(net_income / net_revenue * 100, 1) if net_revenue > 0 else 0.0,
        "monthly_fcf": round(monthly_fcf * mult, 2),
        "payback_months": payback_months,
        "payback_years": round(payback_months / 12, 1) if payback_months else None,
        "roic_annual_pct": round(roic_annual, 1),
        "investment_display": round(inv_display, 2),
        "cumulative_cash_flow": [round(v, 2) for v in hist],  # índice 0 = mês 0
    }


# ─── VPL & TIR ────────────────────────────────────────────────────────────────

def _npv(scenario: dict, inputs: PaybackInputs) -> float:
    """Valor Presente Líquido ao longo da vida útil do equipamento."""
    horizon = inputs.depreciation_years * 12
    rf_m = _monthly_rate(inputs.discount_rate_annual)
    n_inst = max(1, inputs.installments)
    parcelado = n_inst > 1

    hw_display = inputs.hardware_cost * inputs.n_chargers if inputs.portfolio_view else inputs.hardware_cost
    inst_display = inputs.installation_cost * inputs.n_chargers if inputs.portfolio_view else inputs.installation_cost
    hw_installment = hw_display / n_inst if parcelado else 0.0

    pv = -inst_display if parcelado else -scenario["investment_display"]
    for month in range(1, horizon + 1):
        installment = hw_installment if parcelado and month <= n_inst else 0.0
        cf = scenario["monthly_fcf"] - installment
        pv += cf / (1 + rf_m) ** month
    return round(pv, 2)


def _irr(scenario: dict, inputs: PaybackInputs) -> float | None:
    """Taxa Interna de Retorno anual — project IRR (investimento total no t=0)."""
    horizon = inputs.depreciation_years * 12

    # Project IRR: full investment at t=0 regardless of payment schedule.
    # Using equity IRR with installments causes multiple sign-changes that break bisection.
    inv_display = scenario["investment_display"]
    monthly_fcf = scenario["monthly_fcf"]

    if monthly_fcf <= 0:
        return None

    cfs = [-inv_display] + [monthly_fcf] * horizon

    def _pv_at_rate(r: float) -> float:
        return sum(c / (1 + r) ** t for t, c in enumerate(cfs))

    try:
        lo, hi = -0.9999, 10.0
        if _pv_at_rate(lo) * _pv_at_rate(hi) > 0:
            return None
        for _ in range(200):
            mid = (lo + hi) / 2
            if abs(hi - lo) < 1e-9:
                break
            if _pv_at_rate(lo) * _pv_at_rate(mid) <= 0:
                hi = mid
            else:
                lo = mid
        r_monthly = (lo + hi) / 2
        return round(((1 + r_monthly) ** 12 - 1) * 100, 2)  # % anual
    except Exception:
        return None


def _dcf_chart(scenario: dict, inputs: PaybackInputs) -> list[dict]:
    """Fluxo de Caixa Descontado mês a mês."""
    horizon = min(inputs.depreciation_years * 12, 240)
    rf_m = _monthly_rate(inputs.discount_rate_annual)
    n_inst = max(1, inputs.installments)
    parcelado = n_inst > 1

    hw_display = inputs.hardware_cost * inputs.n_chargers if inputs.portfolio_view else inputs.hardware_cost
    hw_installment = hw_display / n_inst if parcelado else 0.0

    result = []
    for month in range(1, horizon + 1):
        installment = hw_installment if parcelado and month <= n_inst else 0.0
        nominal_cf = scenario["monthly_fcf"] - installment
        discounted_cf = nominal_cf / (1 + rf_m) ** month
        result.append({
            "month": month,
            "nominal_cf": round(nominal_cf, 2),
            "discounted_cf": round(discounted_cf, 2),
        })
    return result


# ─── Projeção de longo prazo ──────────────────────────────────────────────────

def _long_term_projection(scenario: dict, inputs: PaybackInputs, years: int = 20) -> list[dict]:
    """Projeção anual por até 20 anos."""
    inv_display = scenario["investment_display"]
    rows = []
    cumulative_ebit = 0.0

    for year in range(1, years + 1):
        annual_revenue = scenario["gross_revenue"] * 12
        annual_ebitda = scenario["ebitda"] * 12
        annual_depreciation = scenario["depreciation"] * 12
        annual_ebit = scenario["ebit"] * 12
        annual_net = scenario["net_income"] * 12
        cumulative_ebit += annual_ebit
        roic = (cumulative_ebit / inv_display * 100) if inv_display > 0 else 0.0

        rows.append({
            "year": year,
            "gross_revenue": round(annual_revenue, 2),
            "ebitda": round(annual_ebitda, 2),
            "ebitda_margin_pct": round(scenario["ebitda_margin_pct"], 1),
            "depreciation": round(annual_depreciation, 2),
            "ebit": round(annual_ebit, 2),
            "net_income": round(annual_net, 2),
            "net_margin_pct": round(scenario["net_margin_pct"], 1),
            "cumulative_roic_pct": round(roic, 1),
        })
    return rows


# ─── Entry point principal ────────────────────────────────────────────────────

DEFAULT_OCCUPANCIES = [10, 20, 40, 60]


def calculate(inputs: PaybackInputs) -> dict[str, Any]:
    """
    Calcula payback completo para todos os cenários de ocupação.
    Retorna dict JSON-serializável com todos os outputs.
    """
    occupancies = list(DEFAULT_OCCUPANCIES)
    if inputs.real_occupancy_pct is not None:
        occupancies.append(round(inputs.real_occupancy_pct, 1))

    inv_unit = inputs.hardware_cost + inputs.installation_cost
    inv_total = inv_unit * inputs.n_chargers

    scenarios_out = []
    for occ in occupancies:
        sc = _calc_scenario(inputs, occ)
        npv = _npv(sc, inputs)
        irr = _irr(sc, inputs)
        dcf = _dcf_chart(sc, inputs)
        projection = _long_term_projection(sc, inputs)

        scenarios_out.append({
            **sc,
            "npv": npv,
            "npv_positive": npv >= 0,
            "irr_annual_pct": irr,
            "irr_beats_benchmark": (irr is not None and irr > inputs.discount_rate_annual),
            "dcf_chart": dcf,
            "long_term_projection": projection,
            "label": _occ_label(occ, inputs.real_occupancy_pct),
        })

    # Fixed income benchmark (renda fixa) — retorno acumulado mês a mês
    rf_m = _monthly_rate(inputs.discount_rate_annual)
    inv_display = inv_total if inputs.portfolio_view else inv_unit
    rf_hist = [round(inv_display * ((1 + rf_m) ** m - 1), 2) for m in range(241)]

    n_inst = max(1, inputs.installments)
    payment_label = "À vista" if n_inst == 1 else f"{n_inst}× sem juros"

    return {
        "inputs_summary": {
            "investment_unit": round(inv_unit, 2),
            "investment_total": round(inv_total, 2),
            "depreciation_monthly": round(inv_unit / max(inputs.depreciation_years * 12, 1), 2),
            "portfolio_view": inputs.portfolio_view,
            "payment_mode": payment_label,
            "installments": n_inst,
        },
        "scenarios": scenarios_out,
        "fixed_income_benchmark": {
            "rate_annual_pct": inputs.discount_rate_annual,
            "cumulative_gain": rf_hist,
        },
    }


def _occ_label(occ: float, real_occ: float | None) -> str:
    labels = {10: "Conservador (10%)", 20: "Moderado (20%)", 40: "Otimista (40%)", 60: "Agressivo (60%)"}
    if real_occ is not None and abs(occ - real_occ) < 0.01:
        return f"Real observado ({occ:.1f}%)"
    return labels.get(int(occ), f"{occ:.1f}%")
