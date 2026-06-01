// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProjectInputs {
  // CAPEX (all values = total project cost, not per-charger)
  n_chargers: number;
  power_kw: number;          // kW per charger
  n_connectors: number;      // connectors per charger
  charger_value: number;
  electrical_infra: number;
  civil_work: number;
  transformer: number;
  electrical_protection: number;
  homologation: number;
  software_backend: number;
  installation: number;
  other_capex: number;
  depreciation_years: number;
  depreciation_as_cash: boolean; // true = deducted from FCF (replacement fund); false = non-cash (tax-only effect)
  payment_installments: number; // 1–10x (installment count)

  // Revenue
  tariff_per_kwh: number;
  start_fee_per_session: number;
  avg_monthly_kwh: number;   // at 100% occupancy
  monthly_growth_pct: number;
  initial_occupancy_pct: number;
  target_occupancy_12m_pct: number;
  sessions_per_day: number;  // at 100% occupancy
  avg_session_minutes: number;
  n_users: number;

  // OPEX (monthly unless noted)
  energy_tariff: number;
  demand_cost: number;
  internet_monthly: number;
  backend_monthly: number;
  preventive_maintenance: number;
  corrective_maintenance: number;
  rent: number;
  insurance: number;
  payment_gateway_pct: number;
  default_rate_pct: number;
  admin_costs: number;
  other_opex: number;

  // Revenue split ("aluguel" percentual para o estabelecimento)
  rev_split_pct: number;           // % cedida ao parceiro (ex: 10 = 10%)
  rev_split_base: "revenue" | "ebitda" | "profit"; // base de cálculo do split

  // Taxes
  tax_rate_pct: number;
  tax_base: "revenue" | "profit"; // "revenue" = Simples (sobre receita); "profit" = Lucro Presumido/Real (sobre EBIT)

  // Parameters
  discount_rate_pct: number;
  fixed_income_rate_pct: number; // benchmark rate for renda fixa comparison in chart
  horizon_years: number;

  // Payment split ("all" = single installment for full CAPEX; "separate" = charger vs. rest)
  payment_split: "all" | "separate";
  charger_installments: number;  // installments for charger_value only
  other_installments: number;    // installments for remaining CAPEX
  payment_interest_rate_pct: number; // monthly interest rate applied to all financing (% a.m.)
}

export const DEFAULT_INPUTS: ProjectInputs = {
  n_chargers: 2,
  power_kw: 22,
  n_connectors: 2,
  charger_value: 40000,
  electrical_infra: 15000,
  civil_work: 8000,
  transformer: 5000,
  electrical_protection: 2000,
  homologation: 2000,
  software_backend: 3000,
  installation: 5000,
  other_capex: 0,
  depreciation_years: 10,
  depreciation_as_cash: true,
  payment_installments: 1,

  tariff_per_kwh: 2.5,
  start_fee_per_session: 0,
  avg_monthly_kwh: 4000,
  monthly_growth_pct: 2,
  initial_occupancy_pct: 20,
  target_occupancy_12m_pct: 60,
  sessions_per_day: 12,
  avg_session_minutes: 90,
  n_users: 150,

  energy_tariff: 0.75,
  demand_cost: 300,
  internet_monthly: 100,
  backend_monthly: 150,
  preventive_maintenance: 200,
  corrective_maintenance: 100,
  rent: 0,
  insurance: 100,
  payment_gateway_pct: 2.5,
  default_rate_pct: 1,
  admin_costs: 200,
  other_opex: 0,

  rev_split_pct: 0,
  rev_split_base: "revenue",

  tax_rate_pct: 0,
  tax_base: "profit",

  discount_rate_pct: 12,
  fixed_income_rate_pct: 12,
  horizon_years: 5,

  payment_split: "all",
  charger_installments: 1,
  other_installments: 1,
  payment_interest_rate_pct: 0,
};

export interface MonthlyPoint {
  month: number;
  label: string;
  revenue: number;
  opex: number;
  split_amount: number;
  ebitda: number;
  depreciation: number;
  ebit: number;
  tax: number;
  fcf: number;
  cumulative_fcf: number;
  cumulative_discounted_fcf: number;
  fixed_income_cum: number; // opportunity cost: -capex*(1+fi_rate)^t
  occupancy: number;
  kwh: number;
}

export interface OccupancyScenarioResult {
  label: string;
  occupancy_pct: number;
  payback_months: number | null;
  npv: number;
  irr: number | null;
  annual_revenue: number;
  annual_profit: number;
  color: string;
  bg: string;
}

export interface SensitivityItem {
  variable: string;
  high_delta: number;
  low_delta: number;
  adverso: number;
  favoravel: number;
}

export interface Insight {
  id: string;
  severity: "success" | "warning" | "error" | "info";
  title: string;
  body: string;
}

export interface ProjectResults {
  capex_total: number;
  capex_per_charger: number;
  capex_per_kw: number;
  capex_per_connector: number;
  monthly_depreciation: number;

  monthly_data: MonthlyPoint[];

  payback_months: number | null;
  payback_discounted_months: number | null;
  npv: number;
  irr: number | null;
  roi_pct: number;
  roi_annual_pct: number;

  avg_monthly_revenue: number;
  avg_monthly_opex: number;
  avg_monthly_ebitda: number;
  avg_monthly_fcf: number;

  annual_revenue_y1: number;
  annual_opex_y1: number;
  annual_fcf_y1: number;
  ebitda_margin: number;
  net_margin_y1: number;

  revenue_per_kw: number;
  revenue_per_charger: number;
  revenue_per_connector: number;
  revenue_per_user: number;
  profit_per_kwh: number;
  opex_per_kwh: number;

  occ_scenarios: OccupancyScenarioResult[];
  sensitivity: SensitivityItem[];
  insights: Insight[];
}

// ─── Calculation helpers ───────────────────────────────────────────────────────

export function calcCapex(inputs: ProjectInputs): number {
  return (
    inputs.charger_value + inputs.electrical_infra + inputs.civil_work +
    inputs.transformer + inputs.electrical_protection + inputs.homologation +
    inputs.software_backend + inputs.installation + inputs.other_capex
  );
}

function occupancyAt(t: number, inputs: ProjectInputs): number {
  const { initial_occupancy_pct: init, target_occupancy_12m_pct: target, monthly_growth_pct } = inputs;
  if (t <= 12) return init + (target - init) * (t / 12);
  const extraGrowth = (monthly_growth_pct / 4 / 100) * (t - 12);
  return Math.min(target * (1 + extraGrowth), 100);
}

function calcMonth(
  t: number,
  inputs: ProjectInputs,
  occMult = 1,
  energyMult = 1,
  tariffMult = 1,
  depreciationMonthly = 0,
): { revenue: number; opex: number; split_amount: number; ebitda: number; ebit: number; tax: number; fcf: number; kwh: number; occ: number } {
  const occ = Math.min(100, occupancyAt(t, inputs) * occMult);
  const occRatio = occ / 100;
  const kwh = inputs.avg_monthly_kwh * occRatio;

  // Revenue: energy tariff + fixed start fee scaled with occupancy
  const kwh_revenue = inputs.tariff_per_kwh * tariffMult * kwh;
  const sessions_month = inputs.sessions_per_day * 30 * occRatio;
  const start_fee_revenue = inputs.start_fee_per_session * sessions_month;
  const revenue = kwh_revenue + start_fee_revenue;

  const energy_cost = inputs.energy_tariff * energyMult * kwh + inputs.demand_cost;
  const gateway = revenue * (inputs.payment_gateway_pct / 100);
  const default_loss = revenue * (inputs.default_rate_pct / 100);
  const fixed_opex =
    inputs.internet_monthly + inputs.backend_monthly +
    inputs.preventive_maintenance + inputs.corrective_maintenance +
    inputs.rent + inputs.insurance + inputs.admin_costs + inputs.other_opex;

  const opex_base = energy_cost + gateway + default_loss + fixed_opex;

  // Revenue split: calculado sobre a base pré-split para evitar circularidade
  const ebitda_pre = revenue - opex_base;
  const ebit_pre = ebitda_pre - depreciationMonthly;
  const splitPct = (inputs.rev_split_pct ?? 0) / 100;
  const split_amount = splitPct > 0
    ? inputs.rev_split_base === "revenue"  ? revenue * splitPct
    : inputs.rev_split_base === "ebitda"   ? Math.max(0, ebitda_pre) * splitPct
    :                                        Math.max(0, ebit_pre) * splitPct
    : 0;

  const opex = opex_base + split_amount;
  const ebitda = revenue - opex;
  const ebit = ebitda - depreciationMonthly;
  const taxRate = inputs.tax_rate_pct / 100;
  const tax = inputs.tax_base === "revenue"
    ? revenue * taxRate
    : Math.max(0, ebit) * taxRate;
  // depreciation_as_cash: treat monthly depreciation as cash provision (fundo de reposição)
  // → FCF = EBIT − Tax = EBITDA − Depreciation − Tax
  // otherwise: depreciation is non-cash, only reduces tax base
  // → FCF = EBITDA − Tax
  const fcf = inputs.depreciation_as_cash ? ebit - tax : ebitda - tax;

  return { revenue, opex, split_amount, ebitda, ebit, tax, fcf, kwh, occ };
}

function bisectionIRR(cashflows: number[]): number | null {
  const pv = (r: number) => cashflows.reduce((s, cf, t) => s + cf / Math.pow(1 + r, t), 0);
  let lo = -0.9999, hi = 5;
  if (pv(lo) * pv(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (Math.abs(hi - lo) < 1e-9) return mid;
    pv(lo) * pv(mid) < 0 ? (hi = mid) : (lo = mid);
  }
  return (lo + hi) / 2;
}

function runScenario(
  inputs: ProjectInputs,
  occMult: number,
  energyMult: number,
  tariffMult = 1,
  depreciationMonthly = 0,
  capexOverride?: number,
): { payback: number | null; npv: number; irr: number | null; annualRev: number; annualProfit: number } {
  const capex = capexOverride ?? calcCapex(inputs);
  const horizon = inputs.horizon_years * 12;
  const mDisc = Math.pow(1 + inputs.discount_rate_pct / 100, 1 / 12) - 1;
  const initial_payment = capexInstallmentAt(0, inputs, capex);

  const cfs: number[] = [-initial_payment];
  let cum = -initial_payment;
  let cumD = -initial_payment;
  let payback: number | null = null;
  let annualRev = 0, annualProfit = 0;

  const deprPeriod = inputs.depreciation_years * 12;
  for (let t = 1; t <= horizon; t++) {
    const deprThisMonth = t <= deprPeriod ? depreciationMonthly : 0;
    const { revenue, fcf } = calcMonth(t, inputs, occMult, energyMult, tariffMult, deprThisMonth);
    const installment_payment = capexInstallmentAt(t, inputs, capex);
    const net_cf = fcf - installment_payment;
    cfs.push(net_cf);
    cum += net_cf;
    cumD += net_cf / Math.pow(1 + mDisc, t);
    if (payback === null && cum >= 0) payback = t;
    if (t <= 12) { annualRev += revenue; annualProfit += (fcf - installment_payment); }
  }

  const monthlyIRR = bisectionIRR(cfs);
  return {
    payback,
    npv: cumD,
    irr: monthlyIRR !== null ? (Math.pow(1 + monthlyIRR, 12) - 1) * 100 : null,
    annualRev,
    annualProfit,
  };
}

function runFixedOccupancy(inputs: ProjectInputs, occ: number, depreciationMonthly: number) {
  const mod = { ...inputs, initial_occupancy_pct: occ, target_occupancy_12m_pct: occ, monthly_growth_pct: 0 };
  return runScenario(mod, 1, 1, 1, depreciationMonthly);
}

function sensitivityPayback(inputs: ProjectInputs, key: string, mult: number, depreciationMonthly: number): number {
  const mod = { ...inputs };
  const horizon = inputs.horizon_years * 12;
  let capexMod = calcCapex(inputs);
  let deprMod = depreciationMonthly;

  if (key === "energy_tariff") mod.energy_tariff *= mult;
  else if (key === "occupancy") {
    mod.initial_occupancy_pct = Math.min(100, mod.initial_occupancy_pct * mult);
    mod.target_occupancy_12m_pct = Math.min(100, mod.target_occupancy_12m_pct * mult);
  } else if (key === "tariff") mod.tariff_per_kwh *= mult;
  else if (key === "capex") {
    capexMod *= mult;
    deprMod = mod.depreciation_years > 0 ? capexMod / (mod.depreciation_years * 12) : 0;
  } else if (key === "gateway") mod.payment_gateway_pct *= mult;
  else if (key === "demand") mod.demand_cost *= mult;

  let cum = -capexInstallmentAt(0, mod, capexMod);

  const deprPeriod = mod.depreciation_years * 12;
  for (let t = 1; t <= horizon; t++) {
    const deprThisMonth = t <= deprPeriod ? deprMod : 0;
    const { fcf } = calcMonth(t, mod, 1, 1, 1, deprThisMonth);
    cum += fcf - capexInstallmentAt(t, mod, capexMod);
    if (cum >= 0) return t;
  }
  return horizon + 1;
}

// Monthly fixed payment (PMT) for a financed principal at a given monthly interest rate.
export function pmt(pv: number, monthlyRate: number, n: number): number {
  if (n <= 0) return 0;
  if (monthlyRate === 0) return pv / n;
  return pv * monthlyRate / (1 - Math.pow(1 + monthlyRate, -n));
}

// Returns the CAPEX installment payment due at period t (0-indexed).
// In "separate" mode, charger and other CAPEX have independent payment schedules.
// With a non-zero monthly interest rate, PMT formula is applied.
function capexInstallmentAt(t: number, inputs: ProjectInputs, capexTotal: number): number {
  const r = inputs.payment_interest_rate_pct / 100; // monthly rate
  if (inputs.payment_split !== "separate") {
    const N = Math.max(1, Math.round(inputs.payment_installments));
    return t < N ? pmt(capexTotal, r, N) : 0;
  }
  const base = calcCapex(inputs);
  const chargerFrac = base > 0 ? inputs.charger_value / base : 0;
  const charger = capexTotal * chargerFrac;
  const other = capexTotal - charger;
  const cN = Math.max(1, Math.round(inputs.charger_installments));
  const oN = Math.max(1, Math.round(inputs.other_installments));
  return (t < cN ? pmt(charger, r, cN) : 0) + (t < oN ? pmt(other, r, oN) : 0);
}

// ─── Main computation ──────────────────────────────────────────────────────────

export function computeProject(inputs: ProjectInputs): ProjectResults {
  const capex = calcCapex(inputs);
  const horizon = inputs.horizon_years * 12;
  const mDisc = Math.pow(1 + inputs.discount_rate_pct / 100, 1 / 12) - 1;
  const fi_monthly_rate = Math.pow(1 + inputs.fixed_income_rate_pct / 100, 1 / 12) - 1;
  const depreciation_monthly = inputs.depreciation_years > 0 ? capex / (inputs.depreciation_years * 12) : 0;
  const initial_payment = capexInstallmentAt(0, inputs, capex);

  const cfs: number[] = [-initial_payment];
  const monthly_data: MonthlyPoint[] = [];
  let cum = -initial_payment;
  let cumD = -initial_payment;
  let payback: number | null = null;
  let paybackDisc: number | null = null;
  let y1Rev = 0, y1Opex = 0, y1Fcf = 0;
  let totalKwh = 0;
  const depr_period = inputs.depreciation_years * 12;

  for (let t = 1; t <= horizon; t++) {
    const deprThisMonth = t <= depr_period ? depreciation_monthly : 0;
    const { revenue, opex, split_amount, ebitda, ebit, tax, fcf, kwh, occ } = calcMonth(t, inputs, 1, 1, 1, deprThisMonth);
    const installment_payment = capexInstallmentAt(t, inputs, capex);
    const net_cf = fcf - installment_payment;
    cfs.push(net_cf);
    cum += net_cf;
    const discNetCf = net_cf / Math.pow(1 + mDisc, t);
    cumD += discNetCf;

    if (payback === null && cum >= 0) payback = t;
    if (paybackDisc === null && cumD >= 0) paybackDisc = t;
    if (t <= 12) { y1Rev += revenue; y1Opex += opex; y1Fcf += net_cf; }
    totalKwh += kwh;

    const yr = Math.floor((t - 1) / 12) + 1;
    const mo = ((t - 1) % 12) + 1;
    monthly_data.push({
      month: t,
      label: `${String(mo).padStart(2, "0")}/${yr}`,
      revenue: Math.round(revenue),
      opex: Math.round(opex),
      split_amount: Math.round(split_amount),
      ebitda: Math.round(ebitda),
      depreciation: Math.round(deprThisMonth),
      ebit: Math.round(ebit),
      tax: Math.round(tax),
      fcf: Math.round(net_cf),
      cumulative_fcf: Math.round(cum),
      cumulative_discounted_fcf: Math.round(cumD),
      fixed_income_cum: Math.round(capex * (Math.pow(1 + fi_monthly_rate, t) - 1)),
      occupancy: Math.round(occ * 10) / 10,
      kwh: Math.round(kwh),
    });
  }

  const monthlyIRR = bisectionIRR(cfs);
  const irr = monthlyIRR !== null ? (Math.pow(1 + monthlyIRR, 12) - 1) * 100 : null;
  const npv = cumD;
  const roi_pct = capex > 0 ? (cum / capex) * 100 : 0;
  const roi_annual_pct = inputs.horizon_years > 0 ? roi_pct / inputs.horizon_years : 0;

  const stable = monthly_data.slice(6);
  const avg_monthly_revenue = stable.length ? stable.reduce((s, m) => s + m.revenue, 0) / stable.length : 0;
  const avg_monthly_opex = stable.length ? stable.reduce((s, m) => s + m.opex, 0) / stable.length : 0;
  const avg_monthly_ebitda = stable.length ? stable.reduce((s, m) => s + m.ebitda, 0) / stable.length : 0;
  const avg_monthly_fcf = stable.length ? stable.reduce((s, m) => s + m.fcf, 0) / stable.length : 0;

  const nc_total = Math.max(inputs.n_connectors * inputs.n_chargers, 1);
  const n = Math.max(inputs.n_chargers, 1);
  const kw = Math.max(inputs.power_kw * inputs.n_chargers, 1);
  const avgKwh = totalKwh / horizon;

  // Occupancy scenarios: 10%, 20%, 40%, 60%
  const occColors = [
    { color: "#94a3b8", bg: "bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700" },
    { color: "#60a5fa", bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800" },
    { color: "#34d399", bg: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800" },
    { color: "#f59e0b", bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800" },
  ];
  const occ_scenarios: OccupancyScenarioResult[] = [10, 20, 40, 60].map((occ, i) => {
    const r = runFixedOccupancy(inputs, occ, depreciation_monthly);
    return {
      label: `${occ}%`,
      occupancy_pct: occ,
      payback_months: r.payback,
      npv: r.npv,
      irr: r.irr,
      annual_revenue: r.annualRev,
      annual_profit: r.annualProfit,
      color: occColors[i].color,
      bg: occColors[i].bg,
    };
  });

  // Sensitivity
  const basePb = payback ?? horizon + 1;
  const sensitivityDefs = [
    { variable: "Tarifa de Energia", key: "energy_tariff" },
    { variable: "Ocupação", key: "occupancy" },
    { variable: "Tarifa Cobrada", key: "tariff" },
    { variable: "CAPEX", key: "capex" },
    { variable: "Taxa Gateway", key: "gateway" },
    { variable: "Demanda Elétrica", key: "demand" },
  ];

  const sensitivity: SensitivityItem[] = sensitivityDefs
    .map(({ variable, key }) => {
      const high_delta = sensitivityPayback(inputs, key, 1.2, depreciation_monthly) - basePb;
      const low_delta = sensitivityPayback(inputs, key, 0.8, depreciation_monthly) - basePb;
      return {
        variable,
        high_delta,
        low_delta,
        adverso: Math.max(high_delta, low_delta),
        favoravel: Math.min(high_delta, low_delta),
      };
    })
    .sort((a, b) =>
      Math.max(Math.abs(b.adverso), Math.abs(b.favoravel)) -
      Math.max(Math.abs(a.adverso), Math.abs(a.favoravel))
    );

  const insights = generateInsights(inputs, payback, irr, npv, y1Rev, y1Opex, y1Fcf, capex, horizon);

  return {
    capex_total: capex,
    capex_per_charger: capex / n,
    capex_per_kw: capex / kw,
    capex_per_connector: capex / nc_total,
    monthly_depreciation: depreciation_monthly,
    monthly_data,
    payback_months: payback,
    payback_discounted_months: paybackDisc,
    npv,
    irr,
    roi_pct,
    roi_annual_pct,
    avg_monthly_revenue,
    avg_monthly_opex,
    avg_monthly_ebitda,
    avg_monthly_fcf,
    annual_revenue_y1: y1Rev,
    annual_opex_y1: y1Opex,
    annual_fcf_y1: y1Fcf,
    ebitda_margin: avg_monthly_revenue > 0 ? (avg_monthly_ebitda / avg_monthly_revenue) * 100 : 0,
    net_margin_y1: y1Rev > 0 ? (y1Fcf / y1Rev) * 100 : 0,
    revenue_per_kw: (y1Rev / 12) / kw,
    revenue_per_charger: (y1Rev / 12) / n,
    revenue_per_connector: (y1Rev / 12) / nc_total,
    revenue_per_user: inputs.n_users > 0 ? (y1Rev / 12) / inputs.n_users : 0,
    profit_per_kwh: avgKwh > 0 ? avg_monthly_fcf / avgKwh : 0,
    opex_per_kwh: avgKwh > 0 ? avg_monthly_opex / avgKwh : 0,
    occ_scenarios,
    sensitivity,
    insights,
  };
}

function generateInsights(
  inputs: ProjectInputs,
  payback: number | null,
  irr: number | null,
  npv: number,
  y1Rev: number,
  y1Opex: number,
  y1Fcf: number,
  capex: number,
  horizon: number,
): Insight[] {
  const out: Insight[] = [];

  if (payback === null || payback > horizon) {
    out.push({ id: "no_payback", severity: "error", title: "Payback não atingido no horizonte", body: "O projeto não recupera o investimento no período analisado. Reavalie CAPEX, tarifa ou ocupação esperada." });
  } else if (payback <= 24) {
    out.push({ id: "fast_payback", severity: "success", title: "Payback excelente", body: `Retorno do investimento em ${payback} meses — excelente para infraestrutura EV (referência do setor: 36–60 meses).` });
  } else if (payback <= 48) {
    out.push({ id: "ok_payback", severity: "info", title: "Payback moderado", body: `Payback em ${payback} meses está dentro da faixa aceitável para infraestrutura de recarga.` });
  } else {
    out.push({ id: "slow_payback", severity: "warning", title: "Payback elevado", body: `${payback} meses de retorno está acima da média recomendada. Considere otimizar estrutura de custos ou aumentar tarifa.` });
  }

  if (npv > 0) {
    out.push({ id: "npv_pos", severity: "success", title: "VPL positivo — projeto viável", body: `VPL de R$ ${Math.round(npv).toLocaleString("pt-BR")} confirma que o projeto cria valor acima do custo de capital de ${inputs.discount_rate_pct}% a.a.` });
  } else {
    out.push({ id: "npv_neg", severity: "error", title: "VPL negativo", body: `O projeto não cobre o custo de capital. Reavalie a estrutura financeira ou reduza o custo de oportunidade.` });
  }

  if (irr !== null) {
    if (irr > inputs.discount_rate_pct + 10) {
      out.push({ id: "irr_high", severity: "success", title: "TIR excelente", body: `TIR de ${irr.toFixed(1)}% supera significativamente o custo de capital (${inputs.discount_rate_pct}% a.a.). Projeto altamente atrativo para investidores.` });
    } else if (irr > inputs.discount_rate_pct) {
      out.push({ id: "irr_ok", severity: "info", title: "TIR aceitável", body: `TIR de ${irr.toFixed(1)}% supera o custo de capital, porém com margem limitada.` });
    } else {
      out.push({ id: "irr_low", severity: "warning", title: "TIR abaixo do custo de capital", body: `TIR de ${irr.toFixed(1)}% não cobre o custo de capital de ${inputs.discount_rate_pct}% a.a. Risco de destruição de valor.` });
    }
  }

  const y1EnergyCost = inputs.energy_tariff * inputs.avg_monthly_kwh * 12 * (inputs.target_occupancy_12m_pct / 100);
  const energyPct = y1Opex > 0 ? (y1EnergyCost / y1Opex) * 100 : 0;
  if (energyPct > 55) {
    out.push({ id: "energy_conc", severity: "warning", title: "Alta concentração em energia", body: `Energia representa ~${energyPct.toFixed(0)}% do OPEX. O projeto tem alta sensibilidade à tarifa da concessionária.` });
  }

  if (inputs.initial_occupancy_pct < 30) {
    out.push({ id: "low_occ", severity: "warning", title: "Ocupação inicial baixa", body: `Ocupação de ${inputs.initial_occupancy_pct}% no início indica período longo de maturação. Invista em estratégia de aquisição de usuários.` });
  }

  if (y1Rev > 0 && capex / y1Rev > 5) {
    out.push({ id: "high_capex", severity: "warning", title: "CAPEX muito elevado vs. receita", body: `O investimento equivale a ${(capex / y1Rev).toFixed(1)}x a receita anual projetada. Certifique-se de que a ocupação evolua conforme o plano.` });
  }

  if (y1Fcf < 0) {
    out.push({ id: "neg_fcf_y1", severity: "warning", title: "Caixa operacional negativo no 1º ano", body: `A operação ainda não cobre seus próprios custos no 1º ano (FCF = R$ ${Math.round(y1Fcf).toLocaleString("pt-BR")}). Reserve capital de giro para este período.` });
  }

  const margin = y1Rev > 0 ? (y1Fcf / y1Rev) * 100 : 0;
  if (margin > 30) {
    out.push({ id: "good_margin", severity: "success", title: "Margem líquida saudável", body: `Margem de ${margin.toFixed(1)}% no 1º ano indica estrutura de custos eficiente e modelo de negócio sólido.` });
  }

  if (inputs.payment_split === "all" && inputs.payment_installments > 1) {
    out.push({ id: "installments", severity: "info", title: `Financiamento em ${inputs.payment_installments}x`, body: `O CAPEX de R$ ${Math.round(capex).toLocaleString("pt-BR")} é pago em ${inputs.payment_installments} parcelas de R$ ${Math.round(capex / inputs.payment_installments).toLocaleString("pt-BR")}/mês. O payback e TIR já refletem esse fluxo de pagamento.` });
  } else if (inputs.payment_split === "separate" && (inputs.charger_installments > 1 || inputs.other_installments > 1)) {
    const other = capex - inputs.charger_value;
    out.push({ id: "installments", severity: "info", title: "Financiamento separado", body: `Carregadores: ${inputs.charger_installments}× de R$ ${Math.round(inputs.charger_value / inputs.charger_installments).toLocaleString("pt-BR")}/mês. Demais custos: ${inputs.other_installments}× de R$ ${Math.round(other / inputs.other_installments).toLocaleString("pt-BR")}/mês.` });
  }

  return out;
}
