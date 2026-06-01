"use client";

import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { TimeRangeSlider } from "@/components/TimeRangeSlider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatPct, formatNumber } from "@/lib/format";
import api from "@/lib/api";
import { useFilters } from "@/contexts/FilterContext";
import { useKPIs, useStations } from "@/hooks/useAnalytics";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";

// Normalize comma as decimal separator
const nd = (v: unknown) =>
  typeof v === "string" ? parseFloat(v.replace(",", ".")) : Number(v);

const numF = z.preprocess(nd, z.number().min(0));
const numFPct = z.preprocess(nd, z.number().min(0).max(100));

const schema = z.object({
  n_chargers: z.preprocess(nd, z.number().int().min(1)),
  hardware_cost: numF,
  installation_cost: numF,
  installments: z.coerce.number().int().min(1).max(10),
  platform_fee_pct: numFPct,
  platform_fixed_monthly: numF,
  energy_cost_per_kwh: numF,
  tax_pct: numFPct,
  maintenance_monthly: numF,
  revenue_split_pct: numFPct,
  depreciation_years: z.preprocess(nd, z.number().int().min(1).max(30)),
  discount_rate_annual: numFPct,
  tariff_per_kwh: numF,
  tariff_per_session: numF,
  avg_kwh_per_session: z.preprocess(nd, z.number().min(0.1)),
  avg_session_duration_min: z.preprocess(nd, z.number().min(1)),
  // operating_hours_per_day handled via time range UI, not a direct field
});

type FormData = z.infer<typeof schema>;

const DEFAULTS: FormData = {
  n_chargers: 1,
  hardware_cost: 15000,
  installation_cost: 5000,
  installments: 1,
  platform_fee_pct: 8,
  platform_fixed_monthly: 50,
  energy_cost_per_kwh: 0.75,
  tax_pct: 6,
  maintenance_monthly: 100,
  revenue_split_pct: 0,
  depreciation_years: 10,
  discount_rate_annual: 12,
  tariff_per_kwh: 1.80,
  tariff_per_session: 0,
  avg_kwh_per_session: 15,
  avg_session_duration_min: 60,
};

const OCC_COLORS = ["#ef4444", "#f59e0b", "#2563eb", "#10b981", "#8b5cf6"];
const SENS_TARIFFS = [1.20, 1.50, 1.80, 2.10, 2.50];
const SENS_OCCS = [10, 20, 40, 60];
const INSTALLMENT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

interface Scenario {
  occupancy_pct: number;
  sessions_month: number;
  kwh_month: number;
  gross_revenue: number;
  net_revenue: number;
  platform_fee: number;
  tax: number;
  revenue_split: number;
  energy_cost: number;
  fixed_platform: number;
  maintenance: number;
  gross_profit: number;
  ebitda: number;
  ebitda_margin_pct: number;
  depreciation: number;
  ebit: number;
  net_income: number;
  net_margin_pct: number;
  monthly_fcf: number;
  payback_months: number | null;
  payback_years: number | null;
  roic_annual_pct: number;
  investment_display: number;
  cumulative_cash_flow: number[];
  npv: number;
  npv_positive: boolean;
  irr_annual_pct: number | null;
  irr_beats_benchmark: boolean;
  label: string;
}

interface PaybackResult {
  inputs_summary: {
    investment_unit: number;
    investment_total: number;
    depreciation_monthly: number;
    portfolio_view: boolean;
    payment_mode: string;
    installments: number;
  };
  scenarios: Scenario[];
  fixed_income_benchmark: {
    rate_annual_pct: number;
    cumulative_gain: number[];
  };
}

function pbColor(pb: number | null): string {
  if (pb === null) return "text-red-500";
  if (pb <= 36) return "text-emerald-600";
  if (pb <= 60) return "text-amber-500";
  return "text-red-500";
}

export default function PaybackPage() {
  const [result, setResult] = useState<PaybackResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [portfolioView, setPortfolioView] = useState(false);
  const [dreScenario, setDreScenario] = useState(0);

  // Time range for operating hours (minutes from midnight)
  const [startMin, setStartMin] = useState(0);
  const [endMin, setEndMin] = useState(1440);
  const operatingHoursPerDay = (endMin - startMin) / 60;

  const { filters } = useFilters();
  const { data: kpis } = useKPIs(filters);
  const { data: stationsData } = useStations(filters, 15, operatingHoursPerDay);

  const form = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: DEFAULTS });
  const watchedValues = form.watch();

  // Approximate dataset occupancy from stations data
  const datasetOcc = useMemo(() => {
    if (!kpis || !kpis.total_sessions || kpis.total_sessions === 0) return null;
    const occupancyArr = stationsData?.occupancy ?? [];
    if (occupancyArr.length === 0) return null;
    const avg = occupancyArr.reduce((s: number, r: { occupancy_pct: number }) => s + r.occupancy_pct, 0) / occupancyArr.length;
    return Math.round(avg);
  }, [kpis, stationsData]);

  const runCalculation = async (values: FormData, pv: boolean) => {
    setLoading(true);
    try {
      const { data } = await api.post<PaybackResult>("/payback/calculate", {
        ...values,
        operating_hours_per_day: operatingHoursPerDay,
        portfolio_view: pv,
        real_occupancy_pct: datasetOcc ?? undefined,
      });
      setResult(data);
    } catch {
      toast.error("Erro ao calcular payback");
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (values: FormData) => runCalculation(values, portfolioView);

  const scenarios = result?.scenarios ?? [];
  const rfBenchmark = result?.fixed_income_benchmark;
  const inputSummary = result?.inputs_summary;
  const depYears = watchedValues.depreciation_years || 10;
  const maxMonths = Math.min(depYears * 12, 240);

  // Accumulated returns chart data
  const accumulatedData = useMemo(() => {
    if (!scenarios.length || !rfBenchmark) return [];
    const maxPb = Math.max(...scenarios.map(sc => sc.payback_months ?? 240));
    const limit = Math.min(Math.floor(maxPb * 1.4) + 12, maxMonths);
    return Array.from({ length: limit + 1 }, (_, i) => {
      const row: Record<string, number> = { month: i };
      scenarios.forEach(sc => { row[sc.label] = sc.cumulative_cash_flow[i] ?? 0; });
      row["Renda Fixa"] = rfBenchmark.cumulative_gain[i] ?? 0;
      return row;
    });
  }, [scenarios, rfBenchmark, maxMonths]);

  // Monthly FCF chart for selected scenario
  const selectedScenario = scenarios[dreScenario];
  const cashFlowData = useMemo(() => {
    if (!selectedScenario) return [];
    const ccf = selectedScenario.cumulative_cash_flow;
    return ccf.slice(0, Math.min(ccf.length, maxMonths + 1)).map((v, i) => ({
      month: i,
      fcf: i === 0 ? v : v - ccf[i - 1],
    }));
  }, [selectedScenario, maxMonths]);

  // Sensitivity table (client-side) — include datasetOcc column if available
  const effectiveSensOccs = useMemo(() => {
    if (datasetOcc !== null && !SENS_OCCS.includes(datasetOcc)) {
      return [...SENS_OCCS, datasetOcc].sort((a, b) => a - b);
    }
    return SENS_OCCS;
  }, [datasetOcc]);

  const sensData = useMemo(() => {
    const v = watchedValues;
    if (!v.hardware_cost) return [];
    const inv = v.hardware_cost + v.installation_cost;
    const n_inst = Math.max(1, v.installments ?? 1);
    const parcelado = n_inst > 1;
    const instDisplay = parcelado ? v.installation_cost : inv;
    const hwInstallment = parcelado ? v.hardware_cost / n_inst : 0;
    const depre = inv / Math.max(v.depreciation_years * 12, 1);

    return SENS_TARIFFS.map(tariff => {
      const row: Record<string, number | null | string> = { tariff: `R$ ${tariff.toFixed(2)}/kWh` };
      effectiveSensOccs.forEach(occ => {
        const sess = (operatingHoursPerDay * 30 * 60 / Math.max(v.avg_session_duration_min, 1)) * (occ / 100);
        const kwhM = sess * v.avg_kwh_per_session;
        const rec = kwhM * tariff + sess * (v.tariff_per_session || 0);
        const netRev = rec - rec * (v.revenue_split_pct || 0) / 100;
        const grossProfit = netRev - kwhM * v.energy_cost_per_kwh;
        const ebitda = grossProfit - rec * v.platform_fee_pct / 100 - v.platform_fixed_monthly - v.maintenance_monthly;
        const ebit = ebitda - depre;
        const netInc = ebit - rec * v.tax_pct / 100;
        if (netInc <= 0) { row[`${occ}%`] = null; return; }
        let acc = -instDisplay;
        let pb: number | null = null;
        for (let m = 1; m <= 240; m++) {
          acc += netInc - (parcelado && m <= n_inst ? hwInstallment : 0);
          if (acc >= 0) { pb = m; break; }
        }
        row[`${occ}%`] = pb;
      });
      return row;
    });
  }, [watchedValues, operatingHoursPerDay, effectiveSensOccs]);

  const rfEol = rfBenchmark?.cumulative_gain[Math.min(maxMonths, 240)] ?? 0;
  const bestScenario = scenarios.reduce<Scenario | null>((best, sc) => {
    const v = sc.cumulative_cash_flow[Math.min(maxMonths, 240)] ?? 0;
    const bv = best ? (best.cumulative_cash_flow[Math.min(maxMonths, 240)] ?? 0) : -Infinity;
    return v > bv ? sc : best;
  }, null);
  const bestEol = bestScenario ? (bestScenario.cumulative_cash_flow[Math.min(maxMonths, 240)] ?? 0) : 0;
  const delta = bestEol - rfEol;

  const dreRows = selectedScenario ? [
    { label: "Sessões / mês",              value: formatNumber(selectedScenario.sessions_month, 1), type: "" },
    { label: "kWh / mês",                  value: formatNumber(selectedScenario.kwh_month, 1), type: "" },
    { label: "ROB — Rec. Bruta",           value: formatCurrency(selectedScenario.gross_revenue), type: "total" },
    ...(selectedScenario.revenue_split > 0 ? [
      { label: "(−) Split estabelecimento", value: `(−) ${formatCurrency(selectedScenario.revenue_split)}`, type: "ded" },
    ] : []),
    { label: "ROL — Rec. Líquida",         value: formatCurrency(selectedScenario.net_revenue), type: "total" },
    { label: "(−) Custo Energia",           value: `(−) ${formatCurrency(selectedScenario.energy_cost)}`, type: "ded" },
    { label: "(=) LUCRO BRUTO",            value: formatCurrency(selectedScenario.gross_profit), type: "total" },
    { label: "    Margem Bruta",            value: formatPct(selectedScenario.gross_profit / (selectedScenario.net_revenue || 1) * 100), type: "pct" },
    { label: "(−) Taxa plataforma %",      value: `(−) ${formatCurrency(selectedScenario.platform_fee)}`, type: "ded" },
    { label: "(−) Plataforma fixo",        value: `(−) ${formatCurrency(selectedScenario.fixed_platform)}`, type: "ded" },
    { label: "(−) Manutenção",             value: `(−) ${formatCurrency(selectedScenario.maintenance)}`, type: "ded" },
    { label: "(=) EBITDA",                 value: formatCurrency(selectedScenario.ebitda), type: "total" },
    { label: "    Margem EBITDA",          value: formatPct(selectedScenario.ebitda_margin_pct), type: "pct" },
    { label: "(−) Depreciação",            value: `(−) ${formatCurrency(selectedScenario.depreciation)}`, type: "ded" },
    { label: "EBIT",                        value: formatCurrency(selectedScenario.ebit), type: "total" },
    { label: "    Margem EBIT",            value: formatPct(selectedScenario.net_revenue > 0 ? selectedScenario.ebit / selectedScenario.net_revenue * 100 : 0), type: "pct" },
    { label: "(−) Impostos Simples",       value: `(−) ${formatCurrency(selectedScenario.tax)}`, type: "ded" },
    { label: "LUCRO LÍQUIDO",              value: formatCurrency(selectedScenario.net_income), type: "total" },
    { label: "    Margem Líquida",         value: formatPct(selectedScenario.net_margin_pct), type: "pct" },
    { label: "    ROIC pré-tax (a.a.)",   value: formatPct(selectedScenario.roic_annual_pct), type: "pct" },
  ] : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Calculadora de Payback</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Análise financeira de retorno sobre investimento em carregadores EV</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Por carregador</span>
          <button
            type="button"
            onClick={() => {
              const next = !portfolioView;
              setPortfolioView(next);
              if (result) form.handleSubmit((v) => runCalculation(v, next))();
            }}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${portfolioView ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"}`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${portfolioView ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
          <span className="text-muted-foreground">Portfólio total</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* ── Inputs ── */}
        <Card className="xl:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Parâmetros</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
                <p className="text-[0.68rem] font-semibold text-muted-foreground uppercase tracking-wide">Investimento</p>
                {([
                  ["n_chargers", "Nº de carregadores"],
                  ["hardware_cost", "Custo unitário hardware (R$)"],
                  ["installation_cost", "Custo instalação/unid (R$)"],
                ] as [keyof FormData, string][]).map(([name, label]) => (
                  <FormField key={name} control={form.control} name={name} render={({ field }) => (
                    <FormItem className="space-y-0.5">
                      <FormLabel className="text-[0.7rem]">{label}</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          inputMode="decimal"
                          className="h-7 text-xs"
                          {...field}
                          value={field.value as string | number}
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                      </FormControl>
                    </FormItem>
                  )} />
                ))}

                {/* Payment mode — installments selector */}
                <FormField control={form.control} name="installments" render={({ field }) => (
                  <FormItem className="space-y-0.5">
                    <FormLabel className="text-[0.7rem]">Forma de pagamento</FormLabel>
                    <FormControl>
                      <div className="flex flex-wrap gap-1">
                        {INSTALLMENT_OPTIONS.map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => field.onChange(n)}
                            className={`text-[0.6rem] px-1.5 py-0.5 rounded border transition-colors ${
                              field.value === n
                                ? "bg-blue-600 text-white border-blue-600"
                                : "border-slate-200 dark:border-slate-700 text-muted-foreground hover:border-blue-400"
                            }`}
                          >
                            {n === 1 ? "À vista" : `${n}×`}
                          </button>
                        ))}
                      </div>
                    </FormControl>
                  </FormItem>
                )} />

                <p className="text-[0.68rem] font-semibold text-muted-foreground uppercase tracking-wide pt-1">Custos operacionais</p>
                {([
                  ["platform_fee_pct", "Taxa plataforma (%)"],
                  ["platform_fixed_monthly", "Taxa fixa plataforma R$/mês"],
                  ["energy_cost_per_kwh", "Custo energia (R$/kWh)"],
                  ["tax_pct", "Impostos — Simples Nacional (%)"],
                  ["maintenance_monthly", "Manutenção/unid R$/mês"],
                  ["revenue_split_pct", "Split estabelecimento (%)"],
                  ["depreciation_years", "Depreciação (anos)"],
                  ["discount_rate_annual", "Taxa juros / renda fixa (% a.a.)"],
                ] as [keyof FormData, string][]).map(([name, label]) => (
                  <FormField key={name} control={form.control} name={name} render={({ field }) => (
                    <FormItem className="space-y-0.5">
                      <FormLabel className="text-[0.7rem]">{label}</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          inputMode="decimal"
                          className="h-7 text-xs"
                          {...field}
                          value={field.value as string | number}
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                      </FormControl>
                    </FormItem>
                  )} />
                ))}

                <p className="text-[0.68rem] font-semibold text-muted-foreground uppercase tracking-wide pt-1">Projeção de receita</p>
                {([
                  ["tariff_per_kwh", "Tarifa cobrada (R$/kWh)"],
                  ["tariff_per_session", "Taxa início de recarga (R$/sessão)"],
                  ["avg_kwh_per_session", "kWh médio por sessão"],
                  ["avg_session_duration_min", "Duração média da sessão (min)"],
                ] as [keyof FormData, string][]).map(([name, label]) => (
                  <FormField key={name} control={form.control} name={name} render={({ field }) => (
                    <FormItem className="space-y-0.5">
                      <FormLabel className="text-[0.7rem]">{label}</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          inputMode="decimal"
                          className="h-7 text-xs"
                          {...field}
                          value={field.value as string | number}
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                      </FormControl>
                    </FormItem>
                  )} />
                ))}

                {/* Operating hours time range */}
                <div className="pt-1">
                  <p className="text-[0.68rem] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Horário de operação</p>
                  <TimeRangeSlider
                    startMin={startMin}
                    endMin={endMin}
                    onChange={(s, e) => { setStartMin(s); setEndMin(e); }}
                    labelClassName="text-[0.7rem]"
                  />
                </div>

                <Button type="submit" className="w-full mt-1 h-8 text-sm" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Calcular
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* ── Results ── */}
        <div className="xl:col-span-3 space-y-4">
          {/* Investment banner */}
          {inputSummary && (
            <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2.5">
              Investimento unitário:{" "}
              <strong className="text-foreground">R$ {formatNumber(inputSummary.investment_unit, 0)}</strong>
              {inputSummary.investment_total !== inputSummary.investment_unit &&
                ` · Total: R$ ${formatNumber(inputSummary.investment_total, 0)}`}
              {" · "}<strong>{inputSummary.payment_mode}</strong>
              {inputSummary.installments > 1 &&
                ` · R$ ${formatNumber(inputSummary.investment_unit / inputSummary.installments, 0)}/mês por ${inputSummary.installments} meses`}
              {datasetOcc !== null && ` · Ocupação do dataset: ${datasetOcc}%`}
            </div>
          )}

          {/* Scenario cards */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
              : scenarios.map((sc, i) => (
                <Card key={i} className="border-l-4" style={{ borderLeftColor: OCC_COLORS[i % OCC_COLORS.length] }}>
                  <CardContent className="pt-3 pb-2 px-3">
                    <p className="text-[0.68rem] text-muted-foreground mb-0.5">{sc.label}</p>
                    <p className={`text-xl font-bold ${pbColor(sc.payback_months)}`}>
                      {sc.payback_months ? `${sc.payback_months}m` : "> 20a"}
                    </p>
                    <p className="text-[0.65rem] text-muted-foreground">
                      {sc.payback_months ? `(${sc.payback_years?.toFixed(1)}a) payback` : "payback não atingido"}
                    </p>
                    <div className="mt-1.5 space-y-0.5 text-[0.68rem]">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Receita/mês</span>
                        <span>{formatCurrency(sc.gross_revenue)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Lucro líq./mês</span>
                        <span className={sc.net_income >= 0 ? "text-emerald-600" : "text-red-500"}>
                          {formatCurrency(sc.net_income)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>

          {/* Monthly FCF chart for selected scenario */}
          {cashFlowData.length > 0 && selectedScenario && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Fluxo de Caixa Livre Mensal — {selectedScenario.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-1 mb-2">
                  {scenarios.map((sc, i) => (
                    <button
                      key={i}
                      onClick={() => setDreScenario(i)}
                      className={`text-[0.65rem] px-2 py-0.5 rounded border transition-colors ${
                        dreScenario === i
                          ? "bg-blue-50 dark:bg-blue-950 border-blue-400 text-blue-700 dark:text-blue-300"
                          : "border-slate-200 dark:border-slate-700 text-muted-foreground hover:border-slate-400"
                      }`}
                    >
                      {sc.occupancy_pct}%
                    </button>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={cashFlowData} margin={{ top: 4, right: 8, left: 0, bottom: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 10 }}
                      label={{ value: "Meses", position: "insideBottom", offset: -8, fontSize: 11 }}
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v: number) =>
                        Math.abs(v) >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v.toFixed(0)}`
                      }
                      width={56}
                    />
                    <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
                    <Tooltip formatter={(v: number) => [formatCurrency(v), "FCF"]} />
                    <Bar dataKey="fcf" radius={[2, 2, 0, 0]}>
                      {cashFlowData.map((entry, i) => (
                        <Cell key={i} fill={entry.fcf >= 0 ? "#10b981" : "#ef4444"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Accumulated returns chart */}
          {accumulatedData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Evolução do Retorno Acumulado</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={288}>
                  <LineChart data={accumulatedData} margin={{ top: 4, right: 8, left: 0, bottom: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11 }}
                      label={{ value: "Meses", position: "insideBottom", offset: -8, fontSize: 11 }}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) =>
                        Math.abs(v) >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v.toFixed(0)}`
                      }
                      width={64}
                    />
                    <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
                    <Tooltip formatter={(v: number, name: string) => [formatCurrency(v), name]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {scenarios.map((sc, i) => (
                      <Line
                        key={i}
                        type="monotone"
                        dataKey={sc.label}
                        stroke={OCC_COLORS[i % OCC_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                    <Line
                      type="monotone"
                      dataKey="Renda Fixa"
                      stroke="#94a3b8"
                      strokeWidth={1.5}
                      strokeDasharray="6 4"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* VPL & TIR */}
          {scenarios.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  VPL & TIR — {watchedValues.depreciation_years} anos · TMA {watchedValues.discount_rate_annual}% a.a.
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                  {scenarios.map((sc, i) => (
                    <div key={i} className="space-y-3">
                      <p className="text-[0.7rem] font-medium" style={{ color: OCC_COLORS[i % OCC_COLORS.length] }}>
                        {sc.label}
                      </p>
                      <div>
                        <p className="text-[0.65rem] text-muted-foreground uppercase tracking-wide">VPL</p>
                        <p className={`text-base font-bold ${sc.npv_positive ? "text-emerald-600" : "text-red-500"}`}>
                          {formatCurrency(sc.npv)}
                        </p>
                        <p className="text-[0.62rem] text-muted-foreground">
                          {sc.npv_positive ? "VPL > 0 — cria valor" : "VPL < 0 — destrói valor"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[0.65rem] text-muted-foreground uppercase tracking-wide">TIR</p>
                        {sc.irr_annual_pct !== null ? (
                          <>
                            <p className={`text-base font-bold ${sc.irr_beats_benchmark ? "text-emerald-600" : "text-amber-500"}`}>
                              {formatPct(sc.irr_annual_pct)} a.a.
                            </p>
                            <p className="text-[0.62rem] text-muted-foreground">
                              {sc.irr_beats_benchmark
                                ? `supera RF em ${formatPct(sc.irr_annual_pct - (watchedValues.discount_rate_annual || 12))}pp`
                                : `abaixo da RF em ${formatPct((watchedValues.discount_rate_annual || 12) - sc.irr_annual_pct)}pp`}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-base font-bold text-red-500">Negativo</p>
                            <p className="text-[0.62rem] text-muted-foreground">
                              FCL negativo — sem retorno no período
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* DRE per scenario */}
          {scenarios.length > 0 && selectedScenario && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-sm">DRE — Demonstrativo de Resultado (Mensal)</CardTitle>
                  <div className="flex gap-1">
                    {scenarios.map((sc, i) => (
                      <button
                        key={i}
                        onClick={() => setDreScenario(i)}
                        className={`text-[0.65rem] px-2 py-0.5 rounded border transition-colors ${
                          dreScenario === i
                            ? "bg-blue-50 dark:bg-blue-950 border-blue-400 text-blue-700 dark:text-blue-300"
                            : "border-slate-200 dark:border-slate-700 text-muted-foreground hover:border-slate-400"
                        }`}
                      >
                        {sc.occupancy_pct}%
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <table className="w-full text-xs">
                  <tbody>
                    {dreRows.map((row, i) => (
                      <tr
                        key={i}
                        className={`border-b ${
                          row.type === "total"
                            ? "bg-emerald-50 dark:bg-emerald-950/40 font-bold"
                            : i % 2 === 0 ? "bg-slate-50 dark:bg-slate-800/30" : ""
                        }`}
                      >
                        <td className={`py-1.5 pl-3 pr-4 ${
                          row.type === "ded" ? "text-red-600" :
                          row.type === "pct" ? "text-blue-600 italic pl-6" :
                          row.type === "total" ? "text-emerald-700 dark:text-emerald-400 font-semibold" : ""
                        }`}>
                          {row.label}
                        </td>
                        <td className={`py-1.5 pr-3 text-right tabular-nums font-medium ${
                          row.type === "ded" ? "text-red-600" :
                          row.type === "pct" ? "text-blue-600 italic" :
                          row.type === "total" ? "text-emerald-700 dark:text-emerald-400" : ""
                        }`}>
                          {row.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Comparativo */}
          {scenarios.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Comparativo: Carregador vs Renda Fixa ({watchedValues.discount_rate_annual}% a.a.)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[0.68rem] text-muted-foreground mb-3">
                  Valores nominais (não descontados) ao final da vida útil de {watchedValues.depreciation_years} anos.
                </p>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="rounded-lg border p-3">
                    <p className="text-[0.68rem] text-muted-foreground">Renda Fixa — {watchedValues.depreciation_years}a</p>
                    <p className="text-lg font-bold text-slate-600 dark:text-slate-400">{formatCurrency(rfEol)}</p>
                    <p className="text-[0.62rem] text-muted-foreground">rendimento total acumulado</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-[0.68rem] text-muted-foreground">Melhor cenário carregador</p>
                    <p className={`text-lg font-bold ${bestEol >= rfEol ? "text-emerald-600" : "text-red-500"}`}>
                      {formatCurrency(bestEol)}
                    </p>
                    <p className="text-[0.62rem] text-muted-foreground">{bestScenario?.label}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-[0.68rem] text-muted-foreground">Vantagem vs Renda Fixa</p>
                    <p className={`text-lg font-bold ${delta >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {delta >= 0 ? "+" : ""}{formatCurrency(delta)}
                    </p>
                    <p className="text-[0.62rem] text-muted-foreground">
                      {delta >= 0 ? "Carregador supera RF" : "RF supera o carregador"}
                    </p>
                  </div>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-1.5 pr-4 font-medium">Cenário</th>
                      <th className="text-right py-1.5 px-2 font-medium">Carregador {watchedValues.depreciation_years}a</th>
                      <th className="text-right py-1.5 px-2 font-medium">Renda Fixa {watchedValues.depreciation_years}a</th>
                      <th className="text-right py-1.5 pl-2 font-medium">Diferença</th>
                      <th className="text-right py-1.5 pl-2 font-medium">Melhor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios.map((sc, i) => {
                      const eol = sc.cumulative_cash_flow[Math.min(maxMonths, 240)] ?? 0;
                      const d = eol - rfEol;
                      return (
                        <tr key={i} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800">
                          <td className="py-1.5 pr-4">{sc.label}</td>
                          <td className={`text-right py-1.5 px-2 tabular-nums ${eol >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                            {formatCurrency(eol)}
                          </td>
                          <td className="text-right py-1.5 px-2 tabular-nums">{formatCurrency(rfEol)}</td>
                          <td className={`text-right py-1.5 px-2 tabular-nums font-medium ${d >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                            {d >= 0 ? "▲ " : "▼ "}{formatCurrency(Math.abs(d))}
                          </td>
                          <td className="text-right py-1.5 pl-2">
                            {d >= 0 ? "⚡ Carregador" : "📈 Renda Fixa"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Sensibilidade */}
          {sensData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Análise de Sensibilidade — Payback (meses)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[0.68rem] text-muted-foreground mb-3">
                  Linhas = tarifa cobrada (R$/kWh) · Colunas = taxa de ocupação
                  {datasetOcc !== null && ` · "Dataset" = ocupação observada (${datasetOcc}%)`}
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-1.5 pr-4 font-medium">Tarifa</th>
                      {effectiveSensOccs.map(occ => (
                        <th key={occ} className={`text-center py-1.5 px-3 font-medium ${datasetOcc === occ ? "text-blue-600" : ""}`}>
                          {datasetOcc === occ ? `${occ}% ★` : `${occ}%`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sensData.map((row, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-1.5 pr-4 font-medium">{row.tariff}</td>
                        {effectiveSensOccs.map(occ => {
                          const v = row[`${occ}%`] as number | null;
                          const cls =
                            v === null ? "bg-red-100 dark:bg-red-950/50 text-red-600" :
                            v <= 36 ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700" :
                            v <= 60 ? "bg-amber-100 dark:bg-amber-950/50 text-amber-700" :
                            "bg-red-100 dark:bg-red-950/50 text-red-600";
                          return (
                            <td key={occ} className={`py-1.5 px-3 text-center rounded ${cls} ${datasetOcc === occ ? "ring-1 ring-blue-400" : ""}`}>
                              {v === null ? "> 20a" : `${v}m`}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {!result && !loading && (
            <div className="flex items-center justify-center h-48 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700">
              <p className="text-muted-foreground text-sm">Preencha os parâmetros e clique em Calcular</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
