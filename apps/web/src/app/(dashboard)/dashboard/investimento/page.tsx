"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import useSWR, { mutate as swrMutate } from "swr";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DownloadableChart } from "@/components/DownloadableChart";
import { TimeRangeSlider } from "@/components/TimeRangeSlider";
import { formatCurrency, formatPct } from "@/lib/format";
import {
  computeProject, calcCapex, calcFixedOpex, pmt, DEFAULT_INPUTS,
  type ProjectInputs, type ProjectResults, type OccupancyScenarioResult,
} from "@/lib/investimentoCalc";
import api, { apiErrMsg } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { PlanGate } from "@/components/PlanGate";
import { useKPIs, useSessionDuration, useConnectors } from "@/hooks/useAnalytics";
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartTooltip, ResponsiveContainer, ReferenceLine, Area, Legend, Cell,
} from "recharts";
import {
  TrendingUp, AlertTriangle, CheckCircle2, Info,
  Zap, DollarSign, Clock, BarChart3, Target, Database, HelpCircle, RefreshCw,
  Download, Upload, Save, FolderOpen, X, Printer, ChevronRight, Search, Loader2,
} from "lucide-react";

// ─── Saved configs (API) ────────────────────────────────────────────────────────

interface SavedConfig {
  id: string;
  name: string;
  inputs: Record<string, unknown>; // ProjectInputs em cenários avançados; {_mode:"simple",...} em cenários simplificados
  results: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  share_token: string | null;
}

// ─── Small helpers ─────────────────────────────────────────────────────────────

function Help({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger className="inline-flex items-center">
        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0 hover:text-blue-500 transition-colors" />
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-64 text-xs leading-snug">{text}</TooltipContent>
    </Tooltip>
  );
}

function NumField({
  label, value, onChange, min = 0, step = 1, prefix, suffix, hint, help,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; step?: number; prefix?: string; suffix?: string; hint?: string; help?: string;
}) {
  // Local string state lets the user clear the field freely without 0 jumping back in.
  const [raw, setRaw] = useState(String(value ?? 0));
  const focused = useRef(false);

  // Sync when the parent changes the value externally (e.g. "fill with real data").
  useEffect(() => {
    if (!focused.current) setRaw(String(value ?? 0));
  }, [value]);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400 leading-tight flex-1">{label}</label>
        {help && <Help text={help} />}
      </div>
      <div className="flex items-center gap-1">
        {prefix && <span className="text-xs text-muted-foreground shrink-0">{prefix}</span>}
        <input
          type="text"
          inputMode="decimal"
          value={raw}
          step={step}
          onChange={e => {
            const v = e.target.value;
            setRaw(v);
            const parsed = parseFloat(v.replace(",", "."));
            if (!isNaN(parsed)) onChange(parsed);
          }}
          onFocus={() => { focused.current = true; }}
          onBlur={() => {
            focused.current = false;
            const parsed = parseFloat(raw.replace(",", "."));
            const final = isNaN(parsed) ? 0 : Math.max(min, parsed);
            onChange(final);
            setRaw(String(final));
          }}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900"
        />
        {suffix && <span className="text-xs text-muted-foreground shrink-0">{suffix}</span>}
      </div>
      {hint && <p className="text-[0.65rem] text-muted-foreground leading-snug">{hint}</p>}
    </div>
  );
}

function KpiCard({
  label, value, sub, color = "slate", badge, badgeVariant,
}: {
  label: string; value: string; sub?: string;
  color?: "slate" | "emerald" | "red" | "blue" | "amber" | "purple";
  badge?: string; badgeVariant?: "default" | "secondary" | "destructive" | "outline";
}) {
  const textColor: Record<string, string> = {
    slate: "text-slate-700 dark:text-slate-200",
    emerald: "text-emerald-600",
    red: "text-red-500",
    blue: "text-blue-600",
    amber: "text-amber-600",
    purple: "text-purple-600",
  };
  return (
    <Card className="border dark:border-slate-800">
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <div className="flex items-end gap-2 flex-wrap">
          <p className={`text-xl font-bold leading-tight ${textColor[color]}`}>{value}</p>
          {badge && <Badge variant={badgeVariant ?? "secondary"} className="text-[0.6rem] mb-0.5">{badge}</Badge>}
        </div>
        {sub && <p className="text-[0.7rem] text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function paybackColor(months: number | null, horizon: number): "emerald" | "amber" | "red" {
  if (!months || months > horizon) return "red";
  if (months <= 24) return "emerald";
  if (months <= 48) return "amber";
  return "red";
}

function fmtPayback(months: number | null, horizon: number): string {
  if (!months || months > horizon) return "N/A";
  return `${months}m (${(months / 12).toFixed(1)} anos)`;
}

function insightIcon(severity: string) {
  switch (severity) {
    case "success": return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />;
    case "warning": return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />;
    case "error":   return <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />;
    default:        return <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />;
  }
}

function PrintParameters({ inputs, results, capex }: { inputs: ProjectInputs; results: ProjectResults; capex: number }) {
  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between py-0.5 border-b border-gray-100 text-[0.65rem]">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
  const horizon = inputs.horizon_years * 12;
  const finLabel = inputs.payment_split === "all" && inputs.payment_installments > 1
    ? `${inputs.payment_installments}× ${(inputs.payment_interest_rate_pct ?? 0) > 0 ? `(${inputs.payment_interest_rate_pct}% a.m.)` : ""}`
    : inputs.payment_split === "separate"
    ? `Separado — Car.: ${inputs.charger_installments}× / Resto: ${inputs.other_installments}×`
    : "À vista";
  return (
    <div className="hidden print:block mb-6 text-black">
      <h2 className="text-sm font-bold mb-2 pb-1 border-b border-gray-400">Parâmetros do Projeto</h2>
      <div className="grid grid-cols-4 gap-4">
        <div>
          <p className="text-[0.55rem] font-bold uppercase tracking-wider text-gray-400 mb-1">CAPEX</p>
          <Row label="Carregadores" value={String(inputs.n_chargers)} />
          <Row label="Conectores/un." value={String(inputs.n_connectors)} />
          <Row label="Potência" value={`${inputs.power_kw} kW`} />
          <Row label="Equipamentos" value={formatCurrency(inputs.charger_value)} />
          <Row label="Infra elétrica" value={formatCurrency(inputs.electrical_infra)} />
          <Row label="Obra civil" value={formatCurrency(inputs.civil_work)} />
          <Row label="Transformador" value={formatCurrency(inputs.transformer)} />
          <Row label="Proteção elétrica" value={formatCurrency(inputs.electrical_protection)} />
          <Row label="Homologações" value={formatCurrency(inputs.homologation)} />
          <Row label="Software/Backend" value={formatCurrency(inputs.software_backend)} />
          <Row label="Instalação" value={formatCurrency(inputs.installation)} />
          <Row label="Outros" value={formatCurrency(inputs.other_capex)} />
          <Row label="CAPEX Total" value={formatCurrency(capex)} />
          <Row label="Financiamento" value={finLabel} />
          <Row label="Depreciação" value={`${inputs.depreciation_years} anos`} />
        </div>
        <div>
          <p className="text-[0.55rem] font-bold uppercase tracking-wider text-gray-400 mb-1">RECEITA</p>
          <Row label="Tarifa" value={`R$ ${inputs.tariff_per_kwh}/kWh`} />
          <Row label="Taxa de sessão" value={`R$ ${inputs.start_fee_per_session}/sess.`} />
          <Row label="kWh/mês (100%)" value={inputs.avg_monthly_kwh.toLocaleString("pt-BR")} />
          <Row label="Ocupação inicial" value={`${inputs.initial_occupancy_pct}%`} />
          <Row label="Ocupação alvo (12m)" value={`${inputs.target_occupancy_12m_pct}%`} />
          <Row label="Cresc. mensal" value={`${inputs.monthly_growth_pct}%`} />
          <Row label="Sessões/dia" value={String(inputs.sessions_per_day)} />
          <Row label="Duração/sessão" value={`${inputs.avg_session_minutes} min`} />
          <Row label="Usuários" value={inputs.n_users > 0 ? String(inputs.n_users) : "—"} />
        </div>
        <div>
          <p className="text-[0.55rem] font-bold uppercase tracking-wider text-gray-400 mb-1">OPEX</p>
          <Row label="Energia" value={`R$ ${inputs.energy_tariff}/kWh`} />
          <Row label="Demanda contratada" value={formatCurrency(inputs.demand_cost)} />
          <Row label="Internet" value={formatCurrency(inputs.internet_monthly)} />
          <Row label="Backend/OCPP" value={formatCurrency(inputs.backend_monthly)} />
          <Row label="Manut. preventiva" value={formatCurrency(inputs.preventive_maintenance)} />
          <Row label="Manut. corretiva" value={formatCurrency(inputs.corrective_maintenance)} />
          <Row label="Aluguel fixo" value={formatCurrency(inputs.rent)} />
          {(inputs.rev_split_pct ?? 0) > 0 && (
            <Row
              label={`Split ${inputs.rev_split_base === "revenue" ? "receita" : inputs.rev_split_base === "ebitda" ? "EBITDA" : "lucro"} ${inputs.rev_split_pct}%`}
              value={formatCurrency(results.monthly_data.slice(-1)[0]?.split_amount ?? 0) + "/mês"}
            />
          )}
          <Row label="Seguro" value={formatCurrency(inputs.insurance)} />
          <Row label="Administrativo" value={formatCurrency(inputs.admin_costs)} />
          <Row label="Outros" value={formatCurrency(inputs.other_opex)} />
          <Row label="Gateway pgto." value={`${inputs.payment_gateway_pct}%`} />
          <Row label="Inadimplência" value={`${inputs.default_rate_pct}%`} />
          <Row label="OPEX est. (mensal)" value={formatCurrency(results.avg_monthly_opex)} />
        </div>
        <div>
          <p className="text-[0.55rem] font-bold uppercase tracking-wider text-gray-400 mb-1">PARÂMETROS</p>
          <Row label="Horizonte" value={`${inputs.horizon_years} anos`} />
          <Row label="Taxa de desconto" value={`${inputs.discount_rate_pct}% a.a.`} />
          <Row label="Renda fixa ref." value={`${inputs.fixed_income_rate_pct}% a.a.`} />
          <Row label="Imposto (IRPJ)" value={`${inputs.tax_rate_pct}%`} />
          <p className="text-[0.55rem] font-bold uppercase tracking-wider text-gray-400 mb-1 mt-2">RESULTADOS</p>
          <Row label="Payback simples" value={fmtPayback(results.payback_months, horizon)} />
          <Row label="Payback descontado" value={fmtPayback(results.payback_discounted_months, horizon)} />
          <Row label="VPL" value={formatCurrency(results.npv)} />
          <Row label="TIR" value={results.irr !== null ? `${results.irr.toFixed(1)}% a.a.` : "N/A"} />
          <Row label="ROI anual" value={formatPct(results.roi_annual_pct)} />
          <Row label="EBITDA mensal (est.)" value={formatCurrency(results.avg_monthly_ebitda)} />
          <Row label="Margem EBITDA" value={formatPct(results.ebitda_margin)} />
          <Row label="FCL mensal (est.)" value={formatCurrency(results.avg_monthly_fcf)} />
        </div>
      </div>
    </div>
  );
}

// ─── Simplified Analysis ──────────────────────────────────────────────────────

interface SimpleInputs {
  n_chargers: number;
  power_kw: number;
  capex_total: number;
  tariff_per_kwh: number;
  energy_cost_per_kwh: number;
  occupancy_pct: number;
  monthly_opex: number;
  revenue_split_pct: number;
}

const DEFAULT_SIMPLE: SimpleInputs = {
  n_chargers: 1,
  power_kw: 60,
  capex_total: 93500,
  tariff_per_kwh: 2.20,
  energy_cost_per_kwh: 0.72,
  occupancy_pct: 30,
  monthly_opex: 300,
  revenue_split_pct: 0,
};

/** Lucro líquido mensal para uma dada ocupação (%), mantendo os demais parâmetros. */
function monthlyNetForOccupancy(s: SimpleInputs, occupancy_pct: number): number {
  // Sempre considera 24h/dia; ocupação representa o % do tempo em uso
  const monthly_kwh = s.n_chargers * s.power_kw * 24 * 30 * (occupancy_pct / 100);
  const monthly_revenue = monthly_kwh * s.tariff_per_kwh;
  const monthly_energy = monthly_kwh * s.energy_cost_per_kwh;
  const monthly_split = monthly_revenue * (s.revenue_split_pct / 100);
  return monthly_revenue - monthly_energy - s.monthly_opex - monthly_split;
}

interface SimpleScenario {
  off: number;           // deslocamento aplicado (-10, -5, +5, +10)
  occ: number;           // ocupação resultante já clampada em [0, 100]
  key: string;           // chave no dataset do gráfico (ex.: "occ_25")
  label: string;         // rótulo exibido (ex.: "25%")
  color: string;
  monthly_net: number;
  payback_months: number | null;
}

function calcSimple(s: SimpleInputs) {
  const baseOcc = s.occupancy_pct;
  // Sempre considera 24h/dia; ocupação representa o % do tempo em uso
  const monthly_kwh = s.n_chargers * s.power_kw * 24 * 30 * (baseOcc / 100);
  const monthly_revenue = monthly_kwh * s.tariff_per_kwh;
  const monthly_energy = monthly_kwh * s.energy_cost_per_kwh;
  const monthly_split = monthly_revenue * (s.revenue_split_pct / 100);
  const monthly_net = monthly_revenue - monthly_energy - s.monthly_opex - monthly_split;
  const payback_months = monthly_net > 0 ? s.capex_total / monthly_net : null;
  const roi_1y = monthly_net > 0 ? ((monthly_net * 12) / s.capex_total) * 100 : 0;
  const horizon = Math.min(84, Math.ceil((payback_months ?? 60) * 2.5));

  // ── Cenários de ocupação ±5% / ±10% em relação à base ──────────────────────
  // Clampa a ocupação resultante em [0%, 100%] e descarta cenários que, após o
  // clamp, coincidam com a base ou com outro cenário (ex.: base 95% → +5/+10 = 100%).
  const OFFSETS: { off: number; color: string }[] = [
    { off: -10, color: "#ef4444" }, // vermelho — pior caso
    { off: -5,  color: "#f59e0b" }, // âmbar
    { off: +5,  color: "#22c55e" }, // verde-claro
    { off: +10, color: "#059669" }, // verde-escuro — melhor caso
  ];
  const seen = new Set<number>([baseOcc]); // base já é exibida como barras
  const scenarios: SimpleScenario[] = [];
  for (const { off, color } of OFFSETS) {
    const occ = Math.max(0, Math.min(100, baseOcc + off));
    if (seen.has(occ)) continue;
    seen.add(occ);
    const net = monthlyNetForOccupancy(s, occ);
    scenarios.push({
      off, occ, color,
      key: `occ_${occ}`,
      label: `${occ}%`,
      monthly_net: net,
      payback_months: net > 0 ? s.capex_total / net : null,
    });
  }

  const chart = Array.from({ length: horizon + 1 }, (_, i) => {
    const row: Record<string, number> = {
      mes: i,
      acumulado: Math.round(monthly_net * i - s.capex_total),
    };
    for (const sc of scenarios) row[sc.key] = Math.round(sc.monthly_net * i - s.capex_total);
    return row;
  });

  return { monthly_kwh, monthly_revenue, monthly_energy, monthly_split, monthly_net, payback_months, roi_1y, baseOcc, scenarios, chart };
}

function SimplifiedAnalysis({ formatCurrency }: { formatCurrency: (v: number) => string }) {
  const [s, setS] = useState<SimpleInputs>(DEFAULT_SIMPLE);
  const r = useMemo(() => calcSimple(s), [s]);
  const setV = (k: keyof SimpleInputs, v: number) => setS(prev => ({ ...prev, [k]: v }));
  const fmtPb = (m: number | null) => {
    if (!m) return "Sem retorno";
    if (m > 120) return "> 10 anos";
    const y = Math.floor(m / 12), mo = Math.round(m % 12);
    return y > 0 ? `${y}a ${mo}m` : `${Math.round(m)} meses`;
  };

  const pbColor = !r.payback_months ? "red"
    : r.payback_months <= 24 ? "emerald"
    : r.payback_months <= 48 ? "blue"
    : r.payback_months <= 72 ? "amber" : "red";

  // ── Save / Load / Export ───────────────────────────────────────────────────
  const simpleFileRef = useRef<HTMLInputElement>(null);
  const [showSavePanel, setShowSavePanel] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { data: allScenarios = [], isLoading: scenariosLoading } = useSWR<SavedConfig[]>(
    "/payback/scenarios",
    (url: string) => api.get(url).then(rr => rr.data),
  );
  // Filter only "simple" scenarios
  const simpleSavedConfigs = useMemo(
    () => allScenarios.filter(c => c.inputs._mode === "simple"),
    [allScenarios]
  );

  function handleSimplePrint() {
    const sidebar = document.querySelector<HTMLElement>("[data-sidebar]");
    const aside = document.querySelector<HTMLElement>(".simplified-aside");
    const toUnclip = Array.from(document.querySelectorAll<HTMLElement>(".h-screen,.h-full,.min-h-0,.overflow-hidden,.overflow-y-auto"));
    const savedSidebar = sidebar ? sidebar.style.display : null;
    const savedAside = aside ? aside.style.display : null;
    const savedUnclip = toUnclip.map(el => ({ el, v: el.style.cssText }));
    if (sidebar) sidebar.style.display = "none";
    if (aside) aside.style.display = "none";
    toUnclip.forEach(el => { el.style.height = "auto"; el.style.maxHeight = "none"; el.style.minHeight = "0"; el.style.overflow = "visible"; });
    const restore = () => {
      if (sidebar && savedSidebar !== null) sidebar.style.display = savedSidebar;
      if (aside && savedAside !== null) aside.style.display = savedAside;
      savedUnclip.forEach(({ el, v }) => { el.style.cssText = v; });
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  }

  function handleExportSimple() {
    const blob = new Blob(
      [JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), inputs: { _mode: "simple", ...s }, results: r }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analise-simples-${new Date().toISOString().slice(0, 10)}.fdproj`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportSimple(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        const data = parsed.inputs ?? parsed;
        if (data._mode !== "simple") { toast.error("Este arquivo é de uma análise avançada. Use na aba Avançada."); return; }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _mode: _ignored, ...rest } = data as Record<string, unknown>;
        setS(prev => ({ ...DEFAULT_SIMPLE, ...prev, ...(rest as Partial<SimpleInputs>) }));
        toast.success("Projeto importado");
      } catch { toast.error("Arquivo inválido. Importe um .fdproj exportado por esta ferramenta."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function handleSaveSimple() {
    if (!saveName.trim()) return;
    setIsSaving(true);
    try {
      await api.post("/payback/scenarios", { name: saveName.trim(), inputs: { _mode: "simple", ...s }, results: r });
      await swrMutate("/payback/scenarios");
      setSaveName("");
      toast.success("Projeto salvo");
    } catch (err) { toast.error(apiErrMsg(err, "Erro ao salvar")); }
    finally { setIsSaving(false); }
  }

  function handleLoadSimple(cfg: SavedConfig) {
    // cfg.inputs is Record<string,unknown> with _mode:"simple" + SimpleInputs fields
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _mode, ...rest } = cfg.inputs;
    setS(prev => ({ ...DEFAULT_SIMPLE, ...prev, ...(rest as Partial<SimpleInputs>) }));
    setShowSavePanel(false);
    toast.success(`Projeto "${cfg.name}" carregado`);
  }

  async function handleDeleteSimple(id: string, name: string) {
    if (!confirm(`Excluir o projeto "${name}"?`)) return;
    try {
      await api.delete(`/payback/scenarios/${id}`);
      await swrMutate("/payback/scenarios");
      toast.success("Projeto excluído");
    } catch (err) { toast.error(apiErrMsg(err, "Erro ao excluir")); }
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Inputs */}
      <aside className="simplified-aside w-72 shrink-0 border-r dark:border-slate-800 overflow-y-auto bg-slate-50/50 dark:bg-slate-900/50 p-4 space-y-3 print:hidden">
        <div>
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Target className="h-4 w-4 text-blue-600" />
            Parâmetros Essenciais
          </h2>
          <p className="text-[0.7rem] text-muted-foreground mt-0.5">Preencha os valores principais do projeto</p>
        </div>
        <NumField label="Qtd. carregadores" value={s.n_chargers} onChange={v => setV("n_chargers", v)} min={1}
          help="Número total de carregadores instalados." />
        <NumField label="Potência (kW/unid.)" value={s.power_kw} onChange={v => setV("power_kw", v)} suffix="kW"
          help="Potência nominal de cada carregador." />
        <NumField label="CAPEX total" value={s.capex_total} onChange={v => setV("capex_total", v)} prefix="R$"
          help="Investimento inicial total: equipamentos, infraestrutura, instalação e homologações." />
        <Separator />
        <NumField label="Tarifa cobrada" value={s.tariff_per_kwh} onChange={v => setV("tariff_per_kwh", v)} prefix="R$" suffix="/kWh" step={0.05}
          help="Preço cobrado ao usuário final por kWh carregado." />
        <NumField label="Custo de energia" value={s.energy_cost_per_kwh} onChange={v => setV("energy_cost_per_kwh", v)} prefix="R$" suffix="/kWh" step={0.01}
          help="Tarifa de energia elétrica paga à concessionária." />
        <NumField label="Ocupação estimada" value={s.occupancy_pct} onChange={v => setV("occupancy_pct", Math.min(100, v))} suffix="%" step={5}
          help="% do tempo total (24h/dia) que os carregadores ficam em uso efetivo. Ex.: 30% = em uso ~7,2h/dia." />
        <Separator />
        <NumField label="OPEX mensal (fixo)" value={s.monthly_opex} onChange={v => setV("monthly_opex", v)} prefix="R$"
          help="Soma de todos os custos fixos mensais: manutenção, internet, aluguel, etc." />
        <NumField label="Split de receita" value={s.revenue_split_pct} onChange={v => setV("revenue_split_pct", Math.min(100, v))} suffix="%" step={1}
          help="% da receita repassada ao dono do espaço (estabelecimento parceiro). 0 = sem split." />
      </aside>

      {/* Results — mesma estrutura que a análise avançada */}
      <main className="flex-1 overflow-y-auto bg-white dark:bg-slate-950">

        {/* Print header — oculto na tela, aparece no PDF */}
        <div className="hidden print:flex items-start justify-between px-0 pt-0 pb-4 mb-2 border-b border-gray-300">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/intelbras-logo.svg" alt="Intelbras" style={{ display: "block", marginBottom: "6px", width: "30mm", height: "auto" }} />
            <h1 className="text-lg font-bold text-black">Análise Simplificada de Investimento — EV</h1>
            <p className="text-xs text-gray-500">
              {s.n_chargers} carregador{s.n_chargers !== 1 ? "es" : ""} · {s.n_chargers * s.power_kw} kW instalados · CAPEX {formatCurrency(s.capex_total)}
            </p>
          </div>
          <div className="text-right text-xs text-gray-400">
            <p>{new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</p>
            <p className="mt-0.5">Intelbras Finance</p>
          </div>
        </div>

        {/* Cabeçalho na tela — oculto no PDF */}
        <div className="px-6 pt-6 pb-4 border-b dark:border-slate-800 print:hidden">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <BarChart3 className="h-6 w-6 text-blue-600" />
                Análise Simplificada
              </h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                Payback simples (não descontado) · estimativa rápida do retorno do investimento
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs">{s.n_chargers} carregador{s.n_chargers !== 1 ? "es" : ""} · {s.n_chargers * s.power_kw} kW</Badge>
              <Badge variant="outline" className="text-xs">CAPEX {formatCurrency(s.capex_total)}</Badge>
              <Badge variant="outline" className="text-xs">Ocup. {s.occupancy_pct}%</Badge>
            </div>
          </div>

          {/* Barra de ações — idêntica à análise avançada */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t dark:border-slate-800 flex-wrap print:hidden">
            <Button size="sm" variant="outline" className="text-xs gap-1.5 h-8" onClick={handleSimplePrint}>
              <Printer className="h-3.5 w-3.5" />
              Exportar PDF
            </Button>
            <Button size="sm" variant="outline" className="text-xs gap-1.5 h-8" onClick={handleExportSimple}>
              <Download className="h-3.5 w-3.5" />
              Exportar .fdproj
            </Button>
            <Button size="sm" variant="outline" className="text-xs gap-1.5 h-8" onClick={() => simpleFileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" />
              Importar
            </Button>
            <div className="relative">
              <Button
                size="sm"
                variant={showSavePanel ? "default" : "outline"}
                className="text-xs gap-1.5 h-8"
                onClick={() => setShowSavePanel(p => !p)}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Projetos salvos
                {simpleSavedConfigs.length > 0 && (
                  <Badge variant="secondary" className="text-[0.55rem] py-0 px-1 ml-0.5">{simpleSavedConfigs.length}</Badge>
                )}
              </Button>
              {showSavePanel && (
                <div className="absolute left-0 top-full mt-1 z-50 w-80 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-4 space-y-3">
                  <p className="text-xs font-semibold">Salvar configuração atual</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Nome do projeto..."
                      value={saveName}
                      onChange={e => setSaveName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleSaveSimple(); }}
                      className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900"
                    />
                    <Button size="sm" className="h-7 gap-1 text-xs shrink-0" onClick={handleSaveSimple} disabled={!saveName.trim() || isSaving}>
                      {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Salvar
                    </Button>
                  </div>
                  <div className="border-t dark:border-slate-700 pt-2 space-y-2">
                    <p className="text-[0.7rem] text-muted-foreground font-medium">
                      Projetos salvos
                      {simpleSavedConfigs.length > 0 && <span className="ml-1 text-muted-foreground/60">({simpleSavedConfigs.length})</span>}
                    </p>
                    {scenariosLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-52 overflow-y-auto -mr-1 pr-1">
                        {simpleSavedConfigs.map(cfg => (
                          <div key={cfg.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 group">
                            <button className="flex-1 text-left min-w-0" onClick={() => handleLoadSimple(cfg)}>
                              <p className="text-xs font-medium truncate">{cfg.name}</p>
                              <p className="text-[0.62rem] text-muted-foreground">
                                {new Date(cfg.updated_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                              </p>
                            </button>
                            <button
                              onClick={() => handleDeleteSimple(cfg.id, cfg.name)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600 p-0.5 shrink-0"
                              title="Excluir projeto"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                        {simpleSavedConfigs.length === 0 && (
                          <p className="text-xs text-center text-muted-foreground py-3">Nenhum projeto salvo ainda.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            {/* Hidden file input for import */}
            <input ref={simpleFileRef} type="file" accept=".fdproj,.json" className="hidden" onChange={handleImportSimple} />
          </div>
        </div>

        {/* Conteúdo */}
        <div className="p-6 space-y-6">

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Receita mensal (est.)", value: formatCurrency(r.monthly_revenue), color: "blue" as const },
            { label: "Custo mensal total", value: formatCurrency(r.monthly_energy + s.monthly_opex + r.monthly_split), color: "amber" as const },
            { label: "Lucro líquido/mês", value: formatCurrency(r.monthly_net), color: r.monthly_net >= 0 ? "emerald" as const : "red" as const },
            { label: "Payback simples", value: fmtPb(r.payback_months), color: pbColor as "emerald" | "blue" | "amber" | "red" | "slate" | "purple" },
          ].map(({ label, value, color }) => (
            <KpiCard key={label} label={label} value={value} color={color} />
          ))}
        </div>

        {/* Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Receita × Custos (mensal)</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {([
                ["kWh consumido/mês", `${Math.round(r.monthly_kwh * 0.5).toLocaleString("pt-BR")} kWh`, "", "Considera 50% do kWh teórico (ocupação × potência × tempo). Na prática os veículos nem sempre usam toda a potência disponível e, no fim da recarga, a potência cai naturalmente — reduzindo a energia efetivamente consumida."],
                ["Receita bruta", formatCurrency(r.monthly_revenue), "text-blue-600 dark:text-blue-400"],
                ["(-) Custo de energia", formatCurrency(r.monthly_energy), "text-red-500"],
                ["(-) OPEX fixo", formatCurrency(s.monthly_opex), "text-red-500"],
                ...(r.monthly_split > 0 ? [["(-) Split de receita", formatCurrency(r.monthly_split), "text-red-500"] as [string, string, string, string?]] : []),
                ["= Lucro líquido/mês", formatCurrency(r.monthly_net), r.monthly_net >= 0 ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-red-600 font-bold"],
                ["ROI anual estimado", `${r.roi_1y.toFixed(1)}%`, r.roi_1y >= 20 ? "text-emerald-600" : "text-amber-600"],
              ] as [string, string, string, string?][]).map(([label, val, cls, help]) => (
                <div key={label} className="flex justify-between border-b last:border-0 pb-1.5 last:pb-0 dark:border-slate-800">
                  <span className="text-muted-foreground flex items-center gap-1">{label}{help ? <Help text={help} /> : null}</span>
                  <span className={`font-medium ${cls}`}>{val}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Resumo do Investimento</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                ["CAPEX total", formatCurrency(s.capex_total), ""],
                ["Lucro mensal líquido", formatCurrency(r.monthly_net), r.monthly_net >= 0 ? "text-emerald-600" : "text-red-500"],
                ["Payback simples", fmtPb(r.payback_months), r.payback_months && r.payback_months <= 48 ? "text-emerald-600 font-bold" : "text-amber-600 font-bold"],
                ["ROI 1º ano", `${r.roi_1y.toFixed(1)}%`, ""],
                ["Capacidade instalada", `${s.n_chargers * s.power_kw} kW`, ""],
              ].map(([label, val, cls]) => (
                <div key={label} className="flex justify-between border-b last:border-0 pb-1.5 last:pb-0 dark:border-slate-800">
                  <span className="text-muted-foreground">{label}</span>
                  <span className={`font-medium ${cls}`}>{val}</span>
                </div>
              ))}
              {r.monthly_net <= 0 && (
                <p className="text-xs text-red-500 pt-1">⚠ O projeto não gera retorno com os parâmetros atuais. Revise a tarifa, ocupação ou OPEX.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Break-even chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recuperação do Investimento (acumulado)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={r.chart} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} tickFormatter={(v) => `M${v}`} interval={Math.ceil(r.chart.length / 10)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${v >= 0 ? "" : "-"}R$${Math.abs(v) >= 1000 ? `${Math.round(Math.abs(v) / 1000)}k` : Math.abs(v)}`} width={72} />
                <RechartTooltip
                  formatter={(v: number, name: string) => [formatCurrency(v), name]}
                  labelFormatter={(l) => `Mês ${l}`}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={0} stroke="#ef4444" strokeWidth={2} strokeDasharray="4 2" label={{ value: "Break-even", position: "insideTopRight", fontSize: 10, fill: "#ef4444" }} />
                <Bar dataKey="acumulado" name={`Base (${r.baseOcc}%)`} radius={[2, 2, 0, 0]}>
                  {r.chart.map((entry, i) => (
                    <Cell key={i} fill={(entry.acumulado ?? 0) >= 0 ? "#10b981" : "#3b82f6"} />
                  ))}
                </Bar>
                {r.scenarios.map((sc) => (
                  <Line
                    key={sc.key}
                    type="monotone"
                    dataKey={sc.key}
                    name={`Ocup. ${sc.label}`}
                    stroke={sc.color}
                    strokeWidth={1.5}
                    strokeDasharray={sc.off < 0 ? "4 2" : undefined}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
            <p className="text-[0.65rem] text-muted-foreground mt-2 text-center">
              Barras = cenário base (azul: capital não recuperado · verde: lucro após payback). Linhas = cenários de ocupação ±5%/±10%
              {" "}(tracejadas = abaixo da base, contínuas = acima), limitadas entre 0% e 100%.
            </p>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground pb-4">
          ℹ️ Esta análise usa <strong>payback simples</strong> (não descontado), sem considerar taxa de juros, inflação ou valor do dinheiro no tempo.
          Para análise completa com VPL, TIR e sensibilidade, use a <strong>Análise Avançada</strong>.
        </p>
        </div>{/* end p-6 space-y-6 */}
      </main>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function InvestimentoPage() {
  const { user } = useAuth();
  const { hasFeature } = usePlanFeatures();
  const canSimple   = hasFeature("investment_simple");
  const canAdvanced = hasFeature("investment_advanced");

  const [inputs, setInputs] = useState<ProjectInputs>(DEFAULT_INPUTS);
  // Default to simple; if simple is blocked but advanced isn't, start on advanced
  const [analysisMode, setAnalysisMode] = useState<"simple" | "advanced">(
    () => (!hasFeature("investment_simple") && hasFeature("investment_advanced") ? "advanced" : "simple")
  );
  const [fillMsg, setFillMsg] = useState<string | null>(null);
  const [showFillPanel, setShowFillPanel] = useState(false);
  const [fillConnectorType, setFillConnectorType] = useState<string>("all");

  // Export / import / save
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showSavePanel, setShowSavePanel] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [scenarioSearch, setScenarioSearch] = useState("");

  const { data: allSavedConfigs = [], isLoading: scenariosLoading } = useSWR<SavedConfig[]>(
    "/payback/scenarios",
    (url: string) => api.get(url).then(r => r.data),
  );
  // Only show advanced scenarios in the advanced mode project list
  const savedConfigs = useMemo(
    () => allSavedConfigs.filter(c => c.inputs._mode !== "simple"),
    [allSavedConfigs]
  );

  // Operating hours as local slider state (minutes from midnight)
  const [startMin, setStartMin] = useState(8 * 60);   // 08:00
  const [endMin, setEndMin] = useState(18 * 60);       // 18:00
  const operatingHoursPerDay = (endMin - startMin) / 60;

  const set = useCallback(<K extends keyof ProjectInputs>(key: K, val: ProjectInputs[K]) =>
    setInputs(prev => ({ ...prev, [key]: val })), []);

  const results: ProjectResults = useMemo(() => computeProject(inputs), [inputs]);

  const capex = calcCapex(inputs);
  const horizon = inputs.horizon_years * 12;

  // kWh/mês a 100% de ocupação — calculado automaticamente, não editável pelo usuário
  const suggestedKwh = useMemo(() => {
    const totalKw = inputs.n_chargers * inputs.power_kw;
    return Math.round(totalKw * operatingHoursPerDay * 30);
  }, [inputs.n_chargers, inputs.power_kw, operatingHoursPerDay]);

  // Mantém avg_monthly_kwh sempre sincronizado com o valor calculado
  useEffect(() => {
    setInputs(prev => ({ ...prev, avg_monthly_kwh: suggestedKwh }));
  }, [suggestedKwh]);

  // Real data for "preencher com dados reais"
  const { data: kpis } = useKPIs({});
  const { data: sessionDuration } = useSessionDuration({});
  const { data: connectorData } = useConnectors({});
  const hasRealData = kpis && (kpis.total_sessions ?? 0) > 0;

  async function handleFillWithRealData() {
    try {
      const params: Record<string, string | string[]> = {};
      if (fillConnectorType !== "all") params.connectors = [fillConnectorType];
      const [kpisRes, durRes] = await Promise.all([
        api.get("/analytics/kpis", { params }),
        api.get("/analytics/session-duration", { params }),
      ]);
      const fk = kpisRes.data;
      const fd = durRes.data;
      if (!fk?.total_sessions) {
        setFillMsg("Nenhum dado encontrado para o filtro selecionado.");
        setShowFillPanel(false);
        setTimeout(() => setFillMsg(null), 5000);
        return;
      }
      const updates: Partial<ProjectInputs> = {};
      if (fk.rev_per_kwh > 0) updates.tariff_per_kwh = Math.round(fk.rev_per_kwh * 100) / 100;
      if (fk.sessions_per_day > 0) updates.sessions_per_day = Math.round(fk.sessions_per_day * 10) / 10;
      if (fk.unique_users > 0) updates.n_users = fk.unique_users;
      if (fd?.avg_duration > 0) updates.avg_session_minutes = Math.round(fd.avg_duration);
      setInputs(prev => ({ ...prev, ...updates }));
      const typeLabel = fillConnectorType !== "all" ? ` (${fillConnectorType})` : "";
      setFillMsg(`Dados${typeLabel} preenchidos: tarifa, sessões/dia, usuários e duração média. Ajuste kWh/mês e ocupação conforme seu projeto.`);
      setShowFillPanel(false);
      setTimeout(() => setFillMsg(null), 7000);
    } catch {
      setFillMsg("Erro ao buscar dados filtrados. Tente novamente.");
      setTimeout(() => setFillMsg(null), 5000);
    }
  }

  function handlePrint() {
    // Hide sidebar and input panel
    const toHide = [
      document.querySelector<HTMLElement>("[data-sidebar]"),
      document.querySelector<HTMLElement>("[data-input-panel]"),
    ].filter((el): el is HTMLElement => !!el);

    // Unclip all containers that use Tailwind's overflow/height utilities
    const toUnclip = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".h-screen, .h-full, .min-h-0, .overflow-hidden, .overflow-y-auto"
      )
    );

    const savedHide = toHide.map(el => ({ el, v: el.style.display }));
    const savedUnclip = toUnclip.map(el => ({ el, v: el.style.cssText }));

    toHide.forEach(el => { el.style.display = "none"; });
    toUnclip.forEach(el => {
      el.style.height = "auto";
      el.style.maxHeight = "none";
      el.style.minHeight = "0";
      el.style.overflow = "visible";
    });

    const restore = () => {
      savedHide.forEach(({ el, v }) => { el.style.display = v; });
      savedUnclip.forEach(({ el, v }) => { el.style.cssText = v; });
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  }

  function handleExportJSON() {
    const blob = new Blob(
      [JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), inputs }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `projeto-investimento-${new Date().toISOString().slice(0, 10)}.fdproj`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportJSON(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        const data: Partial<ProjectInputs> = parsed.inputs ?? parsed;
        setInputs(prev => ({ ...prev, ...data }));
      } catch {
        alert("Arquivo inválido. Certifique-se de importar um arquivo .fdproj exportado por esta ferramenta.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function handleSaveConfig() {
    if (!saveName.trim()) return;
    setIsSaving(true);
    try {
      await api.post("/payback/scenarios", {
        name: saveName.trim(),
        inputs,
        results,
      });
      await swrMutate("/payback/scenarios");
      setSaveName("");
      toast.success("Projeto salvo com sucesso");
    } catch (err) {
      toast.error(apiErrMsg(err, "Erro ao salvar projeto"));
    } finally {
      setIsSaving(false);
    }
  }

  function handleLoadConfig(cfg: SavedConfig) {
    setInputs({ ...DEFAULT_INPUTS, ...(cfg.inputs as Partial<ProjectInputs>) });
    setShowSavePanel(false);
    toast.success(`Projeto "${cfg.name}" carregado`);
  }

  async function handleDeleteConfig(id: string, name: string) {
    if (!confirm(`Excluir o projeto "${name}"?`)) return;
    try {
      await api.delete(`/payback/scenarios/${id}`);
      await swrMutate("/payback/scenarios");
      toast.success("Projeto excluído");
    } catch (err) {
      toast.error(apiErrMsg(err, "Erro ao excluir projeto"));
    }
  }

  // "Atual" occupancy based on actual utilization from real data (sessions × duration / available time)
  const realOccupancy = useMemo(() => {
    if (!hasRealData || !kpis.sessions_per_day || !sessionDuration?.avg_duration) return null;
    const totalConnectors = inputs.n_connectors * inputs.n_chargers;
    if (totalConnectors <= 0 || operatingHoursPerDay <= 0) return null;
    const availableMinutesPerDay = operatingHoursPerDay * 60 * totalConnectors;
    const usedMinutesPerDay = kpis.sessions_per_day * sessionDuration.avg_duration;
    const occ = Math.round((usedMinutesPerDay / availableMinutesPerDay) * 100);
    return Math.max(1, Math.min(100, occ));
  }, [hasRealData, kpis, sessionDuration, inputs.n_connectors, inputs.n_chargers, operatingHoursPerDay]);

  // Reduce monthly data for chart legibility
  const chartData = useMemo(() => {
    const d = results.monthly_data;
    if (d.length <= 36) return d;
    return d.filter((_, i) => i % 2 === 0);
  }, [results.monthly_data]);

  const paybackMonth = results.payback_months;
  const paybackLabel = paybackMonth ? results.monthly_data[paybackMonth - 1]?.label : null;

  // Occupancy scenarios — add "Atual" if real data available and not a near-duplicate
  const allScenarios = useMemo((): (OccupancyScenarioResult & { isReal?: boolean })[] => {
    if (realOccupancy === null) return results.occ_scenarios;
    const duplicate = results.occ_scenarios.some(s => Math.abs(s.occupancy_pct - realOccupancy) < 5);
    if (duplicate) return results.occ_scenarios;

    const realResult = computeProject({
      ...inputs,
      initial_occupancy_pct: realOccupancy,
      target_occupancy_12m_pct: realOccupancy,
      monthly_growth_pct: 0,
    });
    const y1Data = realResult.monthly_data.slice(0, 12);
    const extraScenario: OccupancyScenarioResult & { isReal: boolean } = {
      label: `${realOccupancy}% (Atual)`,
      occupancy_pct: realOccupancy,
      payback_months: realResult.payback_months,
      npv: realResult.npv,
      irr: realResult.irr,
      annual_revenue: y1Data.reduce((s, m) => s + m.revenue, 0),
      annual_profit: y1Data.reduce((s, m) => s + m.fcf, 0),
      color: "#8b5cf6",
      bg: "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800",
      isReal: true,
    };
    return [...results.occ_scenarios, extraScenario].sort((a, b) => a.occupancy_pct - b.occupancy_pct);
  }, [results.occ_scenarios, realOccupancy, inputs]);

  return (
    <TooltipProvider delay={200}>
      <PlanGate feature={["investment_simple", "investment_advanced"]}>
      <div className="flex flex-col h-full min-h-0">
        {/* ── Mode toggle bar ── */}
        <div className="flex items-center gap-3 px-4 py-2 border-b dark:border-slate-800 bg-background shrink-0 print:hidden">
          <span className="text-xs font-medium text-muted-foreground">Análise:</span>
          <div className="flex rounded-lg overflow-hidden border dark:border-slate-700 text-xs">
            {(["simple", "advanced"] as const)
              .filter((m) => m === "simple" ? canSimple : canAdvanced)
              .map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setAnalysisMode(m)}
                  className={`px-3 py-1.5 transition-colors font-medium ${analysisMode === m
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
                >
                  {m === "simple" ? "Simplificada" : "Avançada"}
                </button>
              ))}
          </div>
          {analysisMode === "simple" && (
            <span className="text-[0.65rem] text-muted-foreground">Payback simples · ideal para avaliação rápida</span>
          )}
          {!canAdvanced && canSimple && (
            <span className="text-[0.65rem] text-amber-600 dark:text-amber-400">
              Análise Avançada disponível no plano Pro
            </span>
          )}
        </div>

        {analysisMode === "simple" ? (
          <SimplifiedAnalysis formatCurrency={formatCurrency} />
        ) : (
        <div className="flex flex-1 min-h-0">
        {/* ── LEFT PANEL: Inputs ── */}
        <aside data-input-panel className="w-72 shrink-0 border-r dark:border-slate-800 overflow-y-auto bg-slate-50/50 dark:bg-slate-900/50">
          <div className="p-4 border-b dark:border-slate-800">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-blue-600" />
              Parâmetros do Projeto
            </h2>
            <p className="text-[0.7rem] text-muted-foreground mt-0.5">Recálculo automático em tempo real</p>
            <Button
              size="sm"
              variant="outline"
              className="w-full mt-2 text-xs gap-1.5"
              disabled={!hasRealData}
              onClick={() => setShowFillPanel(p => !p)}
              title={hasRealData ? "Preenche tarifa, sessões/dia, usuários e duração com dados do sistema" : "Nenhum arquivo de dados carregado no sistema"}
            >
              <Database className="h-3.5 w-3.5" />
              {hasRealData ? "Preencher com dados reais" : "Sem dados no sistema"}
            </Button>
            {showFillPanel && hasRealData && (
              <div className="mt-2 p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/30 space-y-2">
                <p className="text-[0.7rem] font-medium text-blue-700 dark:text-blue-400">Filtrar por tipo de conector:</p>
                <select
                  value={fillConnectorType}
                  onChange={e => setFillConnectorType(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="all">Todos os tipos</option>
                  {connectorData?.map((c: { connector_type: string; sessions: number }) => (
                    <option key={c.connector_type} value={c.connector_type}>
                      {c.connector_type} ({c.sessions.toLocaleString("pt-BR")} sessões)
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 text-xs h-7" onClick={handleFillWithRealData}>Aplicar</Button>
                  <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setShowFillPanel(false)}>Cancelar</Button>
                </div>
              </div>
            )}
            {fillMsg && (
              <p className={`text-[0.65rem] mt-1.5 leading-snug ${fillMsg.startsWith("Erro") || fillMsg.startsWith("Nenhum") ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>{fillMsg}</p>
            )}
          </div>

          <Tabs defaultValue="capex" className="w-full">
            <TabsList className="w-full rounded-none border-b dark:border-slate-800 bg-transparent h-auto p-0 flex">
              {["capex", "receita", "opex", "params"].map((tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className="flex-1 rounded-none text-[0.65rem] py-2 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:bg-transparent uppercase tracking-wide"
                >
                  {tab === "params" ? "Config" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* CAPEX */}
            <TabsContent value="capex" className="p-4 space-y-3 mt-0">
              <div className="grid grid-cols-2 gap-3">
                <NumField label="Qtd. carregadores" value={inputs.n_chargers} onChange={v => set("n_chargers", v)} min={1} />
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400 flex-1">Conectores</label>
                    <Help text="Número de conectores por carregador. Um carregador pode ter, usualmente, 1 ou 2 conectores, dividindo a potência total pelo número de conectores ao serem utilizados simultaneamente." />
                  </div>
                  <input type="number" min={1} value={inputs.n_connectors} onChange={e => set("n_connectors", parseInt(e.target.value) || 1)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900" />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400 flex-1">Potência por carregador</label>
                  <Help text="Potência nominal de cada carregador individualmente. A potência total instalada é n° carregadores × potência. Com múltiplos conectores, a potência é dividida entre eles ao usar simultaneamente." />
                </div>
                <div className="flex items-center gap-1">
                  <input type="number" min={0} step={0.5} value={inputs.power_kw} onChange={e => set("power_kw", parseFloat(e.target.value) || 0)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900" />
                  <span className="text-xs text-muted-foreground shrink-0">kW</span>
                </div>
                <p className="text-[0.65rem] text-muted-foreground">
                  Potência total instalada: {inputs.n_chargers * inputs.power_kw} kW
                </p>
              </div>

              <Separator />
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">Composição do CAPEX</p>
                  <Help text="'Total': insira o valor global do investimento. 'Detalhado': especifique cada componente." />
                </div>
                <div className="flex rounded-md border dark:border-slate-700 overflow-hidden text-[0.6rem]">
                  {(["total", "detailed"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        if (m === "total" && (inputs.capex_override ?? 0) === 0) {
                          set("capex_override", calcCapex(inputs));
                        }
                        set("capex_mode", m);
                      }}
                      className={`px-2 py-1 transition-colors ${(inputs.capex_mode ?? "detailed") === m
                        ? "bg-blue-600 text-white font-medium"
                        : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
                    >
                      {m === "total" ? "Total" : "Detalhado"}
                    </button>
                  ))}
                </div>
              </div>

              {(inputs.capex_mode ?? "detailed") === "total" ? (
                <>
                  <NumField label="CAPEX Total" value={inputs.capex_override ?? 0} onChange={v => set("capex_override", v)} prefix="R$"
                    help="Valor total do investimento inicial (carregadores, infra, instalação, etc.). Para especificar cada componente, alterne para 'Detalhado'." />
                  <p className="text-[0.6rem] text-muted-foreground -mt-1">
                    Equivalente detalhado: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(
                      inputs.charger_value + inputs.electrical_infra + inputs.civil_work + inputs.transformer +
                      inputs.electrical_protection + inputs.homologation + inputs.software_backend + inputs.installation + inputs.other_capex
                    )} (soma dos campos detalhados)
                  </p>
                </>
              ) : (
                <>
                  <NumField label="Carregadores" value={inputs.charger_value} onChange={v => set("charger_value", v)} prefix="R$"
                    help="Custo total de aquisição de todos os equipamentos de recarga (hardware)." />
                  <NumField label="Infraestrutura elétrica" value={inputs.electrical_infra} onChange={v => set("electrical_infra", v)} prefix="R$"
                    help="Cabeamento, quadros elétricos, eletrodutos e materiais para distribuição de energia até os carregadores." />
                  <NumField label="Obra civil" value={inputs.civil_work} onChange={v => set("civil_work", v)} prefix="R$"
                    help="Adequação do espaço físico: alvenaria, piso, proteção física dos equipamentos." />
                  <NumField label="Transformador" value={inputs.transformer} onChange={v => set("transformer", v)} prefix="R$"
                    help="Transformador de energia elétrica, quando necessário para adequar a tensão ou aumentar a demanda disponível." />
                  <NumField label="Proteção elétrica" value={inputs.electrical_protection} onChange={v => set("electrical_protection", v)} prefix="R$"
                    help="Dispositivos de proteção: DPS, disjuntores, aterramento e SPDA (para-raios)." />
                  <NumField label="Homologações" value={inputs.homologation} onChange={v => set("homologation", v)} prefix="R$"
                    help="Taxas e projetos de aprovação junto à concessionária de energia, prefeitura e órgãos reguladores." />
                  <NumField label="Software/Backend" value={inputs.software_backend} onChange={v => set("software_backend", v)} prefix="R$"
                    help="Licença ou implantação de plataforma OCPP/OCPI para gestão e monitoramento remoto dos carregadores." />
                  <NumField label="Instalação" value={inputs.installation} onChange={v => set("installation", v)} prefix="R$"
                    help="Mão de obra de instalação, comissionamento e testes dos equipamentos." />
                  <NumField label="Outros" value={inputs.other_capex} onChange={v => set("other_capex", v)} prefix="R$" />
                </>
              )}

              <Separator />
              <div className="flex items-center gap-1.5">
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">Financiamento</p>
                <Help text="Parcelas mensais para o pagamento do CAPEX. Com taxa de juros, o valor da parcela é calculado pela fórmula Price (PMT). O payback e TIR refletem o impacto no fluxo de caixa." />
              </div>
              {/* Completo / Separado toggle */}
              <div className="flex rounded-md border dark:border-slate-700 overflow-hidden text-xs">
                {(["all", "separate"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => set("payment_split", mode)}
                    className={`flex-1 py-1.5 transition-colors ${inputs.payment_split === mode
                      ? "bg-blue-600 text-white font-medium"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"}`}
                  >
                    {mode === "all" ? "Completo" : "Separado"}
                  </button>
                ))}
              </div>

              {/* Interest rate — shared across all financing modes */}
              <NumField
                label="Taxa de juros do financiamento"
                value={inputs.payment_interest_rate_pct ?? 0}
                onChange={v => set("payment_interest_rate_pct", v)}
                min={0} step={0.1} suffix="% a.m."
                help="Taxa de juros mensal cobrada pelo financiador (banco, fabricante, etc.). Com 0% o CAPEX é dividido em parcelas iguais sem acréscimo. Com taxa > 0%, a parcela é calculada pelo método Price (tabela de amortização constante)."
                hint={(inputs.payment_interest_rate_pct ?? 0) > 0
                  ? `≈ ${((Math.pow(1 + (inputs.payment_interest_rate_pct ?? 0) / 100, 12) - 1) * 100).toFixed(1)}% a.a. (juros compostos)`
                  : undefined}
              />

              {inputs.payment_split === "all" ? (
                <select
                  value={inputs.payment_installments}
                  onChange={e => set("payment_installments", parseInt(e.target.value))}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value={1}>À vista (1×) — {formatCurrency(capex)}</option>
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 18, 24, 36, 48, 60].map(n => {
                    const r = (inputs.payment_interest_rate_pct ?? 0) / 100;
                    const installment = pmt(capex, r, n);
                    const total = installment * n;
                    const interest = total - capex;
                    return (
                      <option key={n} value={n}>
                        {n}× de {formatCurrency(installment)}{interest > 0.01 ? ` (total: ${formatCurrency(total)})` : ""}
                      </option>
                    );
                  })}
                </select>
              ) : (
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-[0.7rem] text-muted-foreground">
                      Carregadores <span className="font-medium text-slate-700 dark:text-slate-300">({formatCurrency(inputs.charger_value)})</span>
                    </label>
                    <select
                      value={inputs.charger_installments}
                      onChange={e => set("charger_installments", parseInt(e.target.value))}
                      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900"
                    >
                      <option value={1}>À vista (1×)</option>
                      {[2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 18, 24, 36, 48, 60].map(n => {
                        const r = (inputs.payment_interest_rate_pct ?? 0) / 100;
                        const installment = pmt(inputs.charger_value, r, n);
                        const total = installment * n;
                        const interest = total - inputs.charger_value;
                        return (
                          <option key={n} value={n}>
                            {n}× de {formatCurrency(installment)}{interest > 0.01 ? ` (total: ${formatCurrency(total)})` : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[0.7rem] text-muted-foreground">
                      Demais custos <span className="font-medium text-slate-700 dark:text-slate-300">({formatCurrency(Math.max(0, capex - inputs.charger_value))})</span>
                    </label>
                    <select
                      value={inputs.other_installments}
                      onChange={e => set("other_installments", parseInt(e.target.value))}
                      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900"
                    >
                      <option value={1}>À vista (1×)</option>
                      {[2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 18, 24, 36, 48, 60].map(n => {
                        const r = (inputs.payment_interest_rate_pct ?? 0) / 100;
                        const otherCapex = Math.max(0, capex - inputs.charger_value);
                        const installment = pmt(otherCapex, r, n);
                        const total = installment * n;
                        const interest = total - otherCapex;
                        return (
                          <option key={n} value={n}>
                            {n}× de {formatCurrency(installment)}{interest > 0.01 ? ` (total: ${formatCurrency(total)})` : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              )}

              <Separator />
              <div className="flex items-center gap-1.5">
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">Depreciação</p>
                <Help text="Vida útil contábil do equipamento. Define o valor mensal provisionado para reposição do equipamento ao fim da vida útil." />
              </div>
              <NumField label="Vida útil do equipamento" value={inputs.depreciation_years} onChange={v => set("depreciation_years", Math.max(1, v))} min={1} suffix="anos"
                hint={`Provisão mensal: ${formatCurrency(results.monthly_depreciation)}/mês`} />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={inputs.depreciation_as_cash}
                  onClick={() => set("depreciation_as_cash", !inputs.depreciation_as_cash)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${inputs.depreciation_as_cash ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"}`}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${inputs.depreciation_as_cash ? "translate-x-4" : "translate-x-0"}`} />
                </button>
                <div className="flex items-center gap-1 flex-1">
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    {inputs.depreciation_as_cash ? "Deduzir do FCL (provisão de reposição)" : "Apenas escudo fiscal (não-caixa)"}
                  </span>
                  <Help text={inputs.depreciation_as_cash
                    ? "Modo ativo: a depreciação é descontada diretamente do fluxo de caixa mensal como provisão para reposição do equipamento. Afeta payback, VPL e TIR."
                    : "Modo não-caixa: a depreciação reduz apenas a base tributável do imposto (escudo fiscal). Só impacta o FCL quando a alíquota de imposto > 0%."
                  } />
                </div>
              </div>

              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/40 p-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">CAPEX Total</span>
                  <span className="font-bold text-blue-700 dark:text-blue-400">{formatCurrency(capex)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Por carregador</span>
                  <span className="font-medium">{formatCurrency(results.capex_per_charger)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Por kW instalado</span>
                  <span className="font-medium">{formatCurrency(results.capex_per_kw)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Por conector</span>
                  <span className="font-medium">{formatCurrency(results.capex_per_connector)}</span>
                </div>
                {inputs.payment_installments > 1 && (
                  <div className="flex justify-between text-xs border-t dark:border-blue-900 pt-1 mt-1">
                    <span className="text-muted-foreground">{inputs.payment_installments}× parcela</span>
                    <span className="font-semibold text-amber-600">{formatCurrency(capex / inputs.payment_installments)}/mês</span>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* RECEITA */}
            <TabsContent value="receita" className="p-4 space-y-3 mt-0">
              {/* Operating hours slider */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">Horário de funcionamento</p>
                  <Help text="Janela de operação dos carregadores. Usada para calcular a capacidade máxima de kWh por mês (100% de ocupação). Não afeta diretamente o cálculo financeiro — apenas o valor sugerido de kWh." />
                </div>
                <TimeRangeSlider
                  startMin={startMin}
                  endMin={endMin}
                  onChange={(s, e) => { setStartMin(s); setEndMin(e); }}
                />
              </div>

              <Separator />

              <NumField label="Tarifa cobrada (R$/kWh)" value={inputs.tariff_per_kwh} onChange={v => set("tariff_per_kwh", v)} step={0.05} prefix="R$" suffix="/kWh"
                help="Preço cobrado do usuário por kWh consumido. Receita principal do projeto." />
              <NumField label="Tarifa de início de recarga" value={inputs.start_fee_per_session} onChange={v => set("start_fee_per_session", v)} step={0.5} prefix="R$" suffix="/sessão"
                help="Valor fixo cobrado por sessão iniciada, independente do kWh consumido. Escala proporcionalmente com a ocupação." />

              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400 flex-1">
                    kWh/mês (100% de ocupação)
                  </label>
                  <Help text={`Calculado automaticamente: ${inputs.n_chargers} carregador(es) × ${inputs.power_kw} kW × ${operatingHoursPerDay.toFixed(1)} h/dia × 30 dias = ${suggestedKwh.toLocaleString("pt-BR")} kWh. Ajuste o horário de funcionamento ou a potência para alterar este valor.`} />
                </div>
                <div className="flex items-center gap-1.5 rounded-md border border-input bg-muted/50 px-2 py-1.5">
                  <span className="flex-1 text-sm text-right text-muted-foreground select-none">
                    {suggestedKwh.toLocaleString("pt-BR")}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">kWh</span>
                </div>
                <p className="text-[0.65rem] text-muted-foreground">
                  {inputs.n_chargers}×{inputs.power_kw} kW × {operatingHoursPerDay.toFixed(1)} h/dia × 30 dias
                </p>
              </div>

              <NumField label="Ocupação inicial" value={inputs.initial_occupancy_pct} onChange={v => set("initial_occupancy_pct", Math.min(100, v))} step={1} suffix="%"
                help="Percentual de ocupação esperado no lançamento do projeto (mês 1). Uma ocupação inicial baixa é comum até que os usuários adotem o serviço." />
              <NumField label="Ocupação alvo (12 meses)" value={inputs.target_occupancy_12m_pct} onChange={v => set("target_occupancy_12m_pct", Math.min(100, v))} step={1} suffix="%"
                help="Percentual de ocupação esperado ao final de 12 meses de operação, após a fase de maturação. A ocupação cresce linearmente entre o valor inicial e este." />
              <NumField label="Crescimento pós-12m" value={inputs.monthly_growth_pct} onChange={v => set("monthly_growth_pct", v)} step={0.5} suffix="%"
                help="Taxa de crescimento da ocupação após os primeiros 12 meses (mensal). Usada para projetar crescimento gradual até o limite de 100%." />

              <Separator />
              <NumField label="Sessões por dia (100% ocup.)" value={inputs.sessions_per_day} onChange={v => set("sessions_per_day", v)} step={1}
                help="Número total de sessões de recarga por dia em plena capacidade. Escala proporcionalmente com a ocupação para o cálculo da tarifa de início." />
              <NumField label="Duração média por sessão" value={inputs.avg_session_minutes} onChange={v => set("avg_session_minutes", v)} step={5} suffix="min"
                help="Tempo médio de ocupação de um conector por sessão de recarga. Usado para calcular a taxa de ocupação a partir de dados reais." />
              <NumField label="Usuários estimados" value={inputs.n_users} onChange={v => set("n_users", v)}
                help="Número de usuários únicos esperados para o serviço. Usado apenas para calcular o KPI 'Receita por usuário'." />

              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 p-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Receita mensal (estab.)</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(results.avg_monthly_revenue)}</span>
                </div>
                {inputs.start_fee_per_session > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Tarifa início (est.)</span>
                    <span className="font-medium text-emerald-600">
                      {formatCurrency(inputs.start_fee_per_session * inputs.sessions_per_day * 30 * (inputs.target_occupancy_12m_pct / 100))}/mês
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Por carregador/mês</span>
                  <span className="font-medium">{formatCurrency(results.revenue_per_charger)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Por kW instalado/mês</span>
                  <span className="font-medium">{formatCurrency(results.revenue_per_kw)}</span>
                </div>
              </div>

              <Separator />

              {/* Revenue split */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Split %</span>
                  <Help text="Percentual da receita, EBITDA ou lucro líquido cedido ao estabelecimento como contrapartida pelo uso do espaço. Calculado sobre o valor pré-split para evitar circularidade. Exemplo: 10% do EBITDA significa que o parceiro recebe 10% do lucro operacional antes de impostos gerado pelos carregadores." />
                </div>
                <NumField
                  label="Percentual do split"
                  value={inputs.rev_split_pct ?? 0}
                  onChange={v => set("rev_split_pct", v)}
                  suffix="%"
                  step={0.5}
                  help=""
                />
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Base de cálculo</p>
                  <div className="grid grid-cols-3 rounded-md border dark:border-slate-700 overflow-hidden text-[0.65rem] font-medium">
                    {(["revenue", "ebitda", "profit"] as const).map((base) => (
                      <button
                        key={base}
                        onClick={() => set("rev_split_base", base)}
                        className={`py-1.5 transition-colors ${(inputs.rev_split_base ?? "revenue") === base
                          ? "bg-blue-600 text-white"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"}`}
                      >
                        {base === "revenue" ? "Receita" : base === "ebitda" ? "EBITDA" : "Lucro liq."}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* OPEX */}
            <TabsContent value="opex" className="p-4 space-y-3 mt-0">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">Energia</p>
              <NumField label="Tarifa concessionária (R$/kWh)" value={inputs.energy_tariff} onChange={v => set("energy_tariff", v)} step={0.05} prefix="R$" suffix="/kWh"
                help="Custo pago à distribuidora por cada kWh consumido pelos carregadores. Principal variável de custo do projeto." />
              <NumField label="Demanda contratada" value={inputs.demand_cost} onChange={v => set("demand_cost", v)} prefix="R$" suffix="/mês"
                help="Custo fixo mensal da demanda elétrica contratada junto à concessionária, independente do consumo real. Comum em contratos comerciais." />
              <Separator />
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">Custos Fixos Mensais</p>
                  <Help text="'Total': insira a soma de todos os custos fixos mensais (exceto energia). 'Detalhado': especifique cada item." />
                </div>
                <div className="flex rounded-md border dark:border-slate-700 overflow-hidden text-[0.6rem]">
                  {(["total", "detailed"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        if (m === "total" && inputs.opex_fixed_override === undefined) {
                          set("opex_fixed_override", calcFixedOpex(inputs));
                        }
                        set("opex_mode", m);
                      }}
                      className={`px-2 py-1 transition-colors ${(inputs.opex_mode ?? "total") === m
                        ? "bg-blue-600 text-white font-medium"
                        : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
                    >
                      {m === "total" ? "Total" : "Detalhado"}
                    </button>
                  ))}
                </div>
              </div>

              {(inputs.opex_mode ?? "total") === "total" ? (
                <>
                  <NumField label="OPEX fixo mensal total" value={inputs.opex_fixed_override ?? 240} onChange={v => set("opex_fixed_override", v)} prefix="R$" suffix="/mês"
                    help="Soma de todos os custos fixos mensais: internet, manutenção, aluguel, seguro, administrativo, etc. Exclui energia e taxas variáveis." />
                  <p className="text-[0.6rem] text-muted-foreground -mt-1">
                    Equivalente detalhado: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(
                      inputs.internet_monthly + inputs.backend_monthly + inputs.preventive_maintenance +
                      inputs.corrective_maintenance + inputs.rent + inputs.insurance + inputs.admin_costs + inputs.other_opex
                    )}/mês (soma dos campos detalhados)
                  </p>
                </>
              ) : (
                <>
                  <NumField label="Internet" value={inputs.internet_monthly} onChange={v => set("internet_monthly", v)} prefix="R$" suffix="/mês" />
                  <NumField label="Backend/OCPP" value={inputs.backend_monthly} onChange={v => set("backend_monthly", v)} prefix="R$" suffix="/mês"
                    help="Mensalidade da plataforma de gestão de recarga (software como serviço / SaaS OCPP)." />
                  <NumField label="Manutenção preventiva" value={inputs.preventive_maintenance} onChange={v => set("preventive_maintenance", v)} prefix="R$" suffix="/mês"
                    help="Visitas técnicas periódicas para limpeza, verificação e atualização dos equipamentos." />
                  <NumField label="Manutenção corretiva" value={inputs.corrective_maintenance} onChange={v => set("corrective_maintenance", v)} prefix="R$" suffix="/mês"
                    help="Provisão mensal para reparos não planejados. Recomenda-se de 1 a 2% do CAPEX por ano." />
                  <NumField label="Aluguel fixo" value={inputs.rent} onChange={v => set("rent", v)} prefix="R$" suffix="/mês"
                    help="Aluguel fixo mensal do espaço onde os carregadores estão instalados, se aplicável." />
                  <NumField label="Seguro" value={inputs.insurance} onChange={v => set("insurance", v)} prefix="R$" suffix="/mês" />
                  <NumField label="Custos administrativos" value={inputs.admin_costs} onChange={v => set("admin_costs", v)} prefix="R$" suffix="/mês"
                    help="Custos de gestão: contador, taxas bancárias, suporte ao cliente, etc." />
                  <NumField label="Outros" value={inputs.other_opex} onChange={v => set("other_opex", v)} prefix="R$" suffix="/mês" />
                </>
              )}
              <Separator />
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">Variáveis (% da receita)</p>
              <NumField label="Taxa gateway de pagamento" value={inputs.payment_gateway_pct} onChange={v => set("payment_gateway_pct", v)} step={0.1} suffix="%"
                help="Percentual da receita retido pela operadora de pagamento (ex: PagBank, Cielo). Varia entre 1,5% e 3,5%." />
              <NumField label="Inadimplência" value={inputs.default_rate_pct} onChange={v => set("default_rate_pct", v)} step={0.1} suffix="%"
                help="Percentual estimado de receita não recebida por falha de pagamento, contestações ou transações pendentes." />
              <div className="rounded-lg bg-red-50 dark:bg-red-950/40 p-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">OPEX mensal (estab.)</span>
                  <span className="font-bold text-red-600">{formatCurrency(results.avg_monthly_opex)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">EBITDA mensal (estab.)</span>
                  <span className={`font-medium ${results.avg_monthly_ebitda >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {formatCurrency(results.avg_monthly_ebitda)}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Por kWh</span>
                  <span className="font-medium">{formatCurrency(results.opex_per_kwh)}/kWh</span>
                </div>
              </div>
            </TabsContent>

            {/* PARAMS */}
            <TabsContent value="params" className="p-4 space-y-3 mt-0">
              <NumField label="Taxa de desconto (% a.a.)" value={inputs.discount_rate_pct} onChange={v => set("discount_rate_pct", v)} step={0.5} suffix="%"
                help="Custo de oportunidade do capital (WACC ou taxa mínima de atratividade). Usada para calcular o VPL e Payback Descontado. Quanto maior, mais exigente é a análise." />
              <NumField label="Taxa renda fixa (% a.a.)" value={inputs.fixed_income_rate_pct} onChange={v => set("fixed_income_rate_pct", v)} step={0.5} suffix="%"
                help="Taxa de retorno da renda fixa usada como referência no gráfico de Fluxo de Caixa Acumulado (ex: CDI, CDB). Quando o FCL Acumulado do projeto estiver acima da linha laranja, o projeto supera a renda fixa." />
              <NumField label="Horizonte de análise" value={inputs.horizon_years} onChange={v => set("horizon_years", Math.max(1, Math.min(20, v)))} min={1} step={1} suffix="anos"
                help="Período total simulado (1–20 anos). Deve cobrir ao menos o payback estimado para que o VPL e TIR sejam significativos." />
              <Separator />
              <div className="flex items-center gap-1.5">
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">Impostos</p>
                <Help text="Alíquota efetiva de imposto de renda sobre o lucro operacional (EBIT = EBITDA − depreciação). Use 0 para ignorar. O escudo fiscal da depreciação reduz a base tributável." />
              </div>
              <NumField label="Alíquota efetiva de imposto" value={inputs.tax_rate_pct} onChange={v => set("tax_rate_pct", Math.max(0, Math.min(100, v)))} step={0.5} suffix="%" />
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400 flex-1">Regime tributário</label>
                  <Help text="SN (Simples Nacional): imposto sobre a receita bruta. LP (Lucro Presumido): imposto sobre lucro presumido (~15%). LR (Lucro Real): imposto sobre lucro real apurado (25–34%)." />
                </div>
                <select
                  value={inputs.tax_regime ?? (inputs.tax_base === "revenue" ? "SN" : "LP")}
                  onChange={e => {
                    const regime = e.target.value as "SN" | "LP" | "LR";
                    set("tax_regime", regime);
                    set("tax_base", regime === "SN" ? "revenue" : "profit");
                  }}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="SN">SN — Simples Nacional (sobre a receita)</option>
                  <option value="LP">LP — Lucro Presumido (sobre o lucro)</option>
                  <option value="LR">LR — Lucro Real (sobre o lucro)</option>
                </select>
              </div>
              <div className="rounded-lg bg-slate-100 dark:bg-slate-800/50 p-3 space-y-1.5 text-xs text-muted-foreground">
                <p className="font-semibold text-slate-600 dark:text-slate-400">Referências de alíquota</p>
                <div className="flex justify-between"><span>Simples Nacional</span><span>6–15%</span></div>
                <div className="flex justify-between"><span>Lucro Presumido</span><span>~15%</span></div>
                <div className="flex justify-between"><span>Lucro Real</span><span>25–34%</span></div>
              </div>
              {inputs.tax_rate_pct > 0 && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{inputs.depreciation_as_cash ? "Provisão reposição/mês" : "Depreciação contábil"}</span>
                    <span className={`font-medium ${inputs.depreciation_as_cash ? "text-amber-600" : ""}`}>{formatCurrency(results.monthly_depreciation)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">FCL pós-imposto (estab.)</span>
                    <span className={`font-medium ${results.avg_monthly_fcf >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {formatCurrency(results.avg_monthly_fcf)}
                    </span>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </aside>

        {/* ── RIGHT PANEL: Results ── */}
        <main className="flex-1 overflow-y-auto bg-white dark:bg-slate-950">
          {/* Print header — hidden on screen */}
          <div className="hidden print:flex items-start justify-between px-0 pt-0 pb-4 mb-2 border-b border-gray-300">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/intelbras-logo.svg" alt="Intelbras" style={{ display: "block", marginBottom: "6px", width: "55mm", height: "auto" }} />
              <h1 className="text-lg font-bold text-black">Análise de Investimento — Infraestrutura EV</h1>
              <p className="text-xs text-gray-500">
                {inputs.n_chargers} carregador{inputs.n_chargers !== 1 ? "es" : ""} · {inputs.n_chargers * inputs.power_kw} kW instalados · Horizonte {inputs.horizon_years} anos
              </p>
            </div>
            <div className="text-right text-xs text-gray-400">
              <p>{new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</p>
              {user?.name && <p className="mt-0.5">Gerado por: <span className="font-medium text-gray-600">{user.name}</span></p>}
              {user?.organization_name && <p className="mt-0.5">Organização: <span className="font-medium text-gray-600">{user.organization_name}</span></p>}
            </div>
          </div>

          {/* Header (screen only) */}
          <div className="px-6 pt-6 pb-4 border-b dark:border-slate-800 print:hidden">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <BarChart3 className="h-6 w-6 text-blue-600" />
                  Análise de Investimento
                </h1>
                <p className="text-muted-foreground text-sm mt-0.5">
                  Simulador financeiro para infraestrutura de recarga EV — resultados em tempo real
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">{inputs.n_chargers} carregadores · {inputs.n_chargers * inputs.n_connectors} conectores</Badge>
                <Badge variant="outline" className="text-xs">{inputs.n_chargers * inputs.power_kw} kW total</Badge>
                <Badge variant="outline" className="text-xs">{inputs.horizon_years} anos</Badge>
                {inputs.payment_split === "all" && inputs.payment_installments > 1 && <Badge variant="outline" className="text-xs">{inputs.payment_installments}× parcelas</Badge>}
                {inputs.payment_split === "separate" && (inputs.charger_installments > 1 || inputs.other_installments > 1) && (
                  <Badge variant="outline" className="text-xs">Carregador {inputs.charger_installments}× · Obra {inputs.other_installments}×</Badge>
                )}
                {inputs.tax_rate_pct > 0 && <Badge variant="outline" className="text-xs">Imposto {inputs.tax_rate_pct}% · {inputs.tax_regime ?? (inputs.tax_base === "revenue" ? "SN" : "LP/LR")}</Badge>}
                {hasRealData && <Badge variant="secondary" className="text-xs gap-1"><Database className="h-3 w-3" />Dados reais</Badge>}
              </div>
            </div>

            {/* Action bar: PDF, Export, Import, Save */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t dark:border-slate-800 flex-wrap print:hidden">
              <Button size="sm" variant="outline" className="text-xs gap-1.5 h-8" onClick={handlePrint}>
                <Printer className="h-3.5 w-3.5" />
                Exportar PDF
              </Button>
              <Button size="sm" variant="outline" className="text-xs gap-1.5 h-8" onClick={handleExportJSON}>
                <Download className="h-3.5 w-3.5" />
                Exportar .fdproj
              </Button>
              <Button size="sm" variant="outline" className="text-xs gap-1.5 h-8" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" />
                Importar
              </Button>
              <div className="relative">
                <Button
                  size="sm"
                  variant={showSavePanel ? "default" : "outline"}
                  className="text-xs gap-1.5 h-8"
                  onClick={() => setShowSavePanel(p => !p)}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Projetos salvos
                  {savedConfigs.length > 0 && (
                    <Badge variant="secondary" className="text-[0.55rem] py-0 px-1 ml-0.5">{savedConfigs.length}</Badge>
                  )}
                </Button>
                {showSavePanel && (
                  <div className="absolute left-0 top-full mt-1 z-50 w-80 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-4 space-y-3">
                    {/* ── Salvar ── */}
                    <p className="text-xs font-semibold">Salvar configuração atual</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Nome do projeto..."
                        value={saveName}
                        onChange={e => setSaveName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleSaveConfig(); }}
                        className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900"
                      />
                      <Button
                        size="sm"
                        className="h-7 gap-1 text-xs shrink-0"
                        onClick={handleSaveConfig}
                        disabled={!saveName.trim() || isSaving}
                      >
                        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Salvar
                      </Button>
                    </div>

                    {/* ── Lista de projetos ── */}
                    <div className="border-t dark:border-slate-700 pt-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[0.7rem] text-muted-foreground font-medium">
                          Projetos salvos
                          {savedConfigs.length > 0 && <span className="ml-1 text-muted-foreground/60">({savedConfigs.length})</span>}
                        </p>
                      </div>

                      {/* Campo de busca */}
                      {savedConfigs.length > 3 && (
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                          <input
                            type="text"
                            placeholder="Buscar projeto..."
                            value={scenarioSearch}
                            onChange={e => setScenarioSearch(e.target.value)}
                            className="w-full pl-6 pr-2 py-1 rounded-md border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800"
                          />
                        </div>
                      )}

                      {scenariosLoading ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <div className="space-y-1 max-h-52 overflow-y-auto -mr-1 pr-1">
                          {savedConfigs
                            .filter(cfg => cfg.name.toLowerCase().includes(scenarioSearch.toLowerCase()))
                            .map(cfg => (
                              <div key={cfg.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 group">
                                <button className="flex-1 text-left min-w-0" onClick={() => handleLoadConfig(cfg)}>
                                  <p className="text-xs font-medium truncate">{cfg.name}</p>
                                  <p className="text-[0.62rem] text-muted-foreground">
                                    {new Date(cfg.updated_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                                  </p>
                                </button>
                                <button
                                  onClick={() => handleDeleteConfig(cfg.id, cfg.name)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600 p-0.5 shrink-0"
                                  title="Excluir projeto"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          {savedConfigs.filter(cfg => cfg.name.toLowerCase().includes(scenarioSearch.toLowerCase())).length === 0 && (
                            <p className="text-xs text-center text-muted-foreground py-3">
                              {scenarioSearch ? "Nenhum projeto encontrado." : "Nenhum projeto salvo ainda."}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {/* Hidden file input for import */}
              <input ref={fileInputRef} type="file" accept=".fdproj,.json" className="hidden" onChange={handleImportJSON} />
            </div>
          </div>

          <div className="p-6 space-y-6">

            {/* Print-only parameters table — hidden on screen */}
            <PrintParameters inputs={inputs} results={results} capex={capex} />

            {/* ── KPI STRIP ── */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <KpiCard label="Payback Simples" value={fmtPayback(results.payback_months, horizon)}
                color={paybackColor(results.payback_months, horizon)}
                badge={results.payback_months && results.payback_months <= 24 ? "Excelente" : results.payback_months && results.payback_months <= 48 ? "Moderado" : "Elevado"}
                badgeVariant={results.payback_months && results.payback_months <= 24 ? "default" : "secondary"} />
              <KpiCard label="Payback Descontado" value={fmtPayback(results.payback_discounted_months, horizon)}
                color={paybackColor(results.payback_discounted_months, horizon)} sub={`taxa ${inputs.discount_rate_pct}% a.a.`} />
              <KpiCard label="VPL" value={formatCurrency(results.npv)} color={results.npv >= 0 ? "emerald" : "red"}
                badge={results.npv >= 0 ? "Viável" : "Negativo"} badgeVariant={results.npv >= 0 ? "default" : "destructive"} />
              <KpiCard label="TIR" value={results.irr !== null ? `${results.irr.toFixed(1)}% a.a.` : "N/A"}
                color={results.irr !== null && results.irr > inputs.discount_rate_pct ? "emerald" : "red"}
                sub={results.irr !== null ? `custo capital: ${inputs.discount_rate_pct}%` : undefined} />
              <KpiCard label="ROI Anual" value={formatPct(results.roi_annual_pct)}
                color={results.roi_annual_pct >= 0 ? "blue" : "red"} sub={`ROI total: ${formatPct(results.roi_pct)}`} />
              <KpiCard label="FCL Mensal (estab.)" value={formatCurrency(results.avg_monthly_fcf)}
                color={results.avg_monthly_fcf >= 0 ? "emerald" : "red"} sub={`EBITDA: ${formatCurrency(results.avg_monthly_ebitda)}`} />
            </div>

            {/* ── SECONDARY KPIs ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="Receita Anual (est.)" value={formatCurrency(results.avg_monthly_revenue * 12)} color="blue" sub="base estabilizada" />
              <KpiCard label="OPEX Anual (est.)" value={formatCurrency(results.avg_monthly_opex * 12)} color="red" />
              <KpiCard label="Margem EBITDA (estab.)" value={formatPct(results.ebitda_margin)} color={results.ebitda_margin >= 0 ? "emerald" : "red"} />
              <KpiCard label="Lucro por kWh" value={`${formatCurrency(results.profit_per_kwh)}/kWh`} color={results.profit_per_kwh >= 0 ? "emerald" : "red"} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="Receita/Carregador/mês" value={formatCurrency(results.revenue_per_charger)} sub="estabilizado" />
              <KpiCard label="Receita/Conector/mês" value={formatCurrency(results.revenue_per_connector)} />
              <KpiCard label="Receita/kW instalado/mês" value={formatCurrency(results.revenue_per_kw)} />
              <KpiCard label="Receita/Usuário/mês" value={inputs.n_users > 0 ? formatCurrency(results.revenue_per_user) : "—"} />
            </div>

            {/* ── FLUXO DE CAIXA ACUMULADO ── */}
            <Card className="print:break-before-page">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                  Fluxo de Caixa Acumulado
                  {paybackMonth && (
                    <Badge variant="outline" className="text-xs ml-auto">
                      Payback: mês {paybackMonth} ({paybackLabel})
                    </Badge>
                  )}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  A linha laranja mostra o ganho acumulado que o CAPEX geraria investido em renda fixa. Quando o FCL Acumulado supera esse valor + CAPEX, o projeto supera a renda fixa.
                </p>
              </CardHeader>
              <CardContent>
                <DownloadableChart filename="fcl-acumulado">
                  <ResponsiveContainer width="100%" height={340}>
                    <ComposedChart data={chartData} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="fcfGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} width={60} />
                      <RechartTooltip
                        formatter={(v: number, name: string) => {
                          const labels: Record<string, string> = {
                            cumulative_fcf: "FCL Acumulado",
                            cumulative_discounted_fcf: "FCL Descontado",
                            fixed_income_cum: `Ganho Renda Fixa ${inputs.fixed_income_rate_pct}% a.a.`,
                          };
                          return [formatCurrency(v), labels[name] ?? name];
                        }}
                        labelFormatter={(l) => `Período: ${l}`}
                      />
                      <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1.5} />
                      {paybackLabel && (
                        <ReferenceLine x={paybackLabel} stroke="#10b981" strokeWidth={2} strokeDasharray="6 3"
                          label={{ value: "Payback", position: "insideTopRight", fontSize: 10, fill: "#10b981" }} />
                      )}
                      <Area type="monotone" dataKey="cumulative_fcf" fill="url(#fcfGrad)" stroke="#2563eb" strokeWidth={2.5} dot={false} name="cumulative_fcf" />
                      <Line type="monotone" dataKey="cumulative_discounted_fcf" stroke="#8b5cf6" strokeWidth={1.5} dot={false} strokeDasharray="5 3" name="cumulative_discounted_fcf" />
                      <Line type="monotone" dataKey="fixed_income_cum" stroke="#f97316" strokeWidth={1.5} dot={false} strokeDasharray="8 4" name="fixed_income_cum" />
                      <Legend formatter={(v: string) => ({
                        cumulative_fcf: "FCL Acumulado",
                        cumulative_discounted_fcf: "FCL Descontado",
                        fixed_income_cum: `Ganho Renda Fixa ${inputs.fixed_income_rate_pct}% a.a.`,
                      }[v] ?? v)} wrapperStyle={{ fontSize: 11 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </DownloadableChart>
              </CardContent>
            </Card>

            {/* ── RECEITA VS CUSTO VS LUCRO ── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                  Receita × OPEX × EBITDA × FCL por Período
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DownloadableChart filename="receita-opex-lucro">
                  <ResponsiveContainer width="100%" height={364}>
                    <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} width={56} />
                      <RechartTooltip formatter={(v: number, name: string) => {
                        const labels: Record<string, string> = {
                          revenue: "Receita", opex: "OPEX", ebitda: "EBITDA",
                          depreciation: "Depreciação/Provisão", fcf: "FCL",
                        };
                        return [formatCurrency(v), labels[name] ?? name];
                      }} />
                      <Legend formatter={(v: string) => ({ revenue: "Receita", opex: "OPEX", ebitda: "EBITDA", depreciation: "Deprec.", fcf: "FCL" }[v] ?? v)} wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="revenue" fill="#2563eb" opacity={0.85} name="revenue" />
                      <Bar dataKey="opex" fill="#ef4444" opacity={0.75} name="opex" />
                      <Line type="monotone" dataKey="ebitda" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="ebitda" />
                      {results.monthly_depreciation > 0 && (
                        <Line type="monotone" dataKey="depreciation" stroke="#a855f7" strokeWidth={1.5} dot={false} strokeDasharray="6 3" name="depreciation" />
                      )}
                      <Line type="monotone" dataKey="fcf" stroke="#10b981" strokeWidth={2.5} dot={false} name="fcf" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </DownloadableChart>
              </CardContent>
            </Card>

            {/* ── CENÁRIOS DE OCUPAÇÃO ── */}
            <div>
              <h2 className="text-base font-semibold mb-1 flex items-center gap-2">
                <Target className="h-4 w-4 text-blue-600" />
                Cenários por Nível de Ocupação
              </h2>
              <p className="text-xs text-muted-foreground mb-3">
                Ocupação fixa ao longo do horizonte, mantendo todos os demais parâmetros.
                {hasRealData && realOccupancy !== null && (
                  <span className="ml-1 text-violet-600 dark:text-violet-400 font-medium">
                    Ocupação real estimada: ~{realOccupancy}% ({inputs.n_connectors * inputs.n_chargers} conectores × {operatingHoursPerDay.toFixed(1)}h/dia)
                  </span>
                )}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-4">
                {allScenarios.map((s) => (
                  <Card key={s.label} className={`border ${s.bg}`}>
                    <CardHeader className="pb-1 pt-3 px-3">
                      <CardTitle className="text-sm font-bold" style={{ color: s.color }}>
                        {s.label}
                        {"isReal" in s && s.isReal && (
                          <Badge variant="outline" className="ml-1 text-[0.55rem] border-violet-300 text-violet-600 align-middle">real</Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 pt-0 px-3 pb-3">
                      {[
                        ["Payback", fmtPayback(s.payback_months, horizon)],
                        ["TIR", s.irr !== null ? `${s.irr.toFixed(1)}% a.a.` : "N/A"],
                        ["VPL", formatCurrency(s.npv)],
                        ["Receita Ano 1", formatCurrency(s.annual_revenue)],
                        ["Lucro Ano 1", formatCurrency(s.annual_profit)],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{k}</span>
                          <span className="font-semibold">{v}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Card className="print:break-before-page">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Comparativo — Payback por Nível de Ocupação (meses)</CardTitle>
                </CardHeader>
                <CardContent>
                  <DownloadableChart filename="cenarios-ocupacao">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={allScenarios.map(s => ({ name: s.label, payback: s.payback_months ?? horizon + 1, color: s.color }))}
                        margin={{ top: 8, right: 32, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} label={{ value: "meses", angle: -90, position: "insideLeft", fontSize: 10 }} width={50} />
                        <RechartTooltip formatter={(v: number) => [`${v} meses`, "Payback"]} />
                        <Bar dataKey="payback" radius={[4, 4, 0, 0]}>
                          {allScenarios.map((s, i) => <Cell key={i} fill={s.color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </DownloadableChart>
                </CardContent>
              </Card>
            </div>

            {/* ── SENSIBILIDADE (TORNADO) ── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  Análise de Sensibilidade — Impacto no Payback (meses)
                </CardTitle>
                <p className="text-xs text-muted-foreground">Variação de ±20% em cada parâmetro vs. cenário base. Vermelho = payback piora; verde = payback melhora.</p>
              </CardHeader>
              <CardContent>
                <DownloadableChart filename="sensibilidade-tornado">
                  <ResponsiveContainer width="100%" height={Math.max(200, results.sensitivity.length * 44)}>
                    <BarChart layout="vertical"
                      data={results.sensitivity.map(s => ({
                        variable: s.variable,
                        adverso: s.adverso > 0 ? s.adverso : 0,
                        favoravel: s.favoravel < 0 ? s.favoravel : 0,
                      }))}
                      margin={{ top: 4, right: 48, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v}m`} />
                      <YAxis type="category" dataKey="variable" tick={{ fontSize: 10 }} width={150} />
                      <RechartTooltip formatter={(v: number, name: string) => [
                        `${v > 0 ? "+" : ""}${v} meses`,
                        name === "adverso" ? "Pior caso" : "Melhor caso",
                      ]} />
                      <ReferenceLine x={0} stroke="#94a3b8" />
                      <Bar dataKey="adverso" fill="#ef4444" opacity={0.85} radius={[0, 3, 3, 0]} name="adverso" />
                      <Bar dataKey="favoravel" fill="#10b981" opacity={0.85} radius={[3, 0, 0, 3]} name="favoravel" />
                      <Legend formatter={(v: string) => v === "adverso" ? "Impacto adverso (+20%)" : "Impacto favorável (−20%)"} wrapperStyle={{ fontSize: 11 }} />
                    </BarChart>
                  </ResponsiveContainer>
                </DownloadableChart>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left pb-1.5 pr-4">Variável</th>
                        <th className="text-right pb-1.5 pr-4">+20%</th>
                        <th className="text-right pb-1.5">−20%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.sensitivity.map((s) => (
                        <tr key={s.variable} className="border-b last:border-0">
                          <td className="py-1.5 pr-4 font-medium">{s.variable}</td>
                          <td className={`text-right py-1.5 pr-4 ${s.high_delta > 0 ? "text-red-500" : s.high_delta < 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                            {s.high_delta > 0 ? "+" : ""}{s.high_delta}m
                          </td>
                          <td className={`text-right py-1.5 ${s.low_delta < 0 ? "text-emerald-600" : s.low_delta > 0 ? "text-red-500" : "text-muted-foreground"}`}>
                            {s.low_delta > 0 ? "+" : ""}{s.low_delta}m
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* ── DRE ── */}
            <DRESection results={results} inputs={inputs} />

            {/* ── INSIGHTS ── */}
            <div>
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                <Info className="h-4 w-4 text-blue-600" />
                Insights Automáticos
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {results.insights.map((ins) => (
                  <div key={ins.id}
                    className={`flex gap-3 rounded-lg border p-4 ${
                      ins.severity === "success" ? "border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-800" :
                      ins.severity === "warning" ? "border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800" :
                      ins.severity === "error"   ? "border-red-200 bg-red-50/60 dark:bg-red-950/20 dark:border-red-800" :
                      "border-blue-200 bg-blue-50/60 dark:bg-blue-950/20 dark:border-blue-800"
                    }`}>
                    {insightIcon(ins.severity)}
                    <div>
                      <p className="text-sm font-semibold">{ins.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{ins.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── CURVA DE ADOÇÃO ── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4 text-purple-600" />
                  Curva de Adoção — Ocupação e kWh ao longo do tempo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DownloadableChart filename="curva-adocao">
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={chartData} margin={{ top: 4, right: 48, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                      <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} width={40} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} width={44} />
                      <RechartTooltip formatter={(v: number, name: string) => name === "occupancy" ? [`${v}%`, "Ocupação"] : [`${v.toLocaleString("pt-BR")} kWh`, "kWh"]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => v === "occupancy" ? "Ocupação (%)" : "kWh"} />
                      <Area yAxisId="left" type="monotone" dataKey="occupancy" fill="#8b5cf633" stroke="#8b5cf6" strokeWidth={2} dot={false} name="occupancy" />
                      <Line yAxisId="right" type="monotone" dataKey="kwh" stroke="#06b6d4" strokeWidth={2} dot={false} name="kwh" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </DownloadableChart>
              </CardContent>
            </Card>

            {/* ── SIMULAÇÃO DE EXPANSÃO (toggle, collapsed by default) ── */}
            <ExpansionSimulator base={results} inputs={inputs} />

          </div>
        </main>
        </div>
        )}
      </div>
      </PlanGate>
    </TooltipProvider>
  );
}

// ─── DRE (Demonstração de Resultado) ─────────────────────────────────────────

function DRESection({ results, inputs }: { results: ProjectResults; inputs: ProjectInputs }) {
  const years = Math.min(inputs.horizon_years, 5);
  const taxRate = inputs.tax_rate_pct / 100;
  const depMonthly = results.monthly_depreciation;

  const dreRows = useMemo(() => {
    return Array.from({ length: years }, (_, i) => {
      const mths = results.monthly_data.slice(i * 12, (i + 1) * 12);
      if (mths.length === 0) return null;
      const receita = mths.reduce((s, m) => s + m.revenue, 0);
      const opex = mths.reduce((s, m) => s + m.opex, 0);
      const ebitda = mths.reduce((s, m) => s + m.ebitda, 0);
      const depreciacao = depMonthly * mths.length;
      const ebit = ebitda - depreciacao;
      const imposto = inputs.tax_base === "revenue"
        ? receita * taxRate
        : Math.max(0, ebit) * taxRate;
      const resultado = ebit - imposto;
      const fcl = mths.reduce((s, m) => s + m.fcf, 0);
      return { year: i + 1, receita, opex, ebitda, depreciacao, ebit, imposto, resultado, fcl };
    }).filter(Boolean) as Array<{
      year: number; receita: number; opex: number; ebitda: number;
      depreciacao: number; ebit: number; imposto: number; resultado: number; fcl: number;
    }>;
  }, [results.monthly_data, years, depMonthly, taxRate, inputs.tax_base]);

  const dreLines: Array<{
    key: keyof typeof dreRows[0]; label: string;
    prefix?: string; sign?: "neg"; bold?: boolean; separator?: boolean; highlight?: string;
  }> = [
    { key: "receita", label: "Receita Bruta", bold: true },
    { key: "opex", label: "(−) OPEX (custos operacionais)", sign: "neg" },
    { key: "ebitda", label: "(=) EBITDA", bold: true, separator: true, highlight: "amber" },
    { key: "depreciacao", label: `(−) Depreciação${inputs.depreciation_as_cash ? " / Provisão" : " (contábil)"}`, sign: "neg" },
    { key: "ebit", label: "(=) EBIT — Resultado Operacional", bold: true, separator: true, highlight: "blue" },
    { key: "imposto", label: `(−) Imposto ${inputs.tax_rate_pct > 0 ? `(${inputs.tax_rate_pct}% s/ ${inputs.tax_base === "revenue" ? "receita" : "lucro"})` : "(0%)"}`, sign: "neg" },
    { key: "resultado", label: "(=) Resultado Líquido", bold: true, separator: true, highlight: "emerald" },
  ];

  if (dreRows.length === 0) return null;

  function cellColor(key: string, value: number) {
    if (key === "resultado" || key === "ebitda" || key === "ebit") {
      return value >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500";
    }
    return "";
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-blue-600" />
          DRE — Demonstração de Resultado do Exercício
        </CardTitle>
        <p className="text-xs text-muted-foreground">Projeção anual baseada nos parâmetros configurados. Valores em R$.</p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b dark:border-slate-700">
                <th className="text-left pb-2 pr-4 font-medium text-muted-foreground w-56">Linha</th>
                {dreRows.map(r => (
                  <th key={r.year} className="text-right pb-2 px-3 font-semibold text-slate-700 dark:text-slate-300">
                    Ano {r.year}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dreLines.map((line) => (
                <tr key={line.key} className={`border-b dark:border-slate-800/60 last:border-0 ${line.separator ? "border-t-2 dark:border-slate-700" : ""}`}>
                  <td className={`py-1.5 pr-4 ${line.bold ? "font-semibold" : "text-muted-foreground"} ${
                    line.highlight === "emerald" ? "text-emerald-700 dark:text-emerald-400" :
                    line.highlight === "blue" ? "text-blue-700 dark:text-blue-400" :
                    line.highlight === "amber" ? "text-amber-700 dark:text-amber-400" : ""
                  }`}>
                    {line.label}
                  </td>
                  {dreRows.map(r => {
                    const val = r[line.key];
                    const displayed = line.sign === "neg" ? -val : val;
                    return (
                      <td key={r.year} className={`text-right py-1.5 px-3 tabular-nums ${line.bold ? "font-semibold" : ""} ${cellColor(line.key, val)}`}>
                        {formatCurrency(displayed)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {inputs.tax_rate_pct === 0 && (
          <p className="text-[0.65rem] text-muted-foreground mt-2">
            Imposto zerado. Configure a alíquota em <span className="font-medium">Config → Impostos</span> para refletir o regime tributário real.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Expansion Simulator ──────────────────────────────────────────────────────

function ExpansionSimulator({ base, inputs }: { base: ProjectResults; inputs: ProjectInputs }) {
  const [open, setOpen] = useState(false);
  const [extraChargers, setExtraChargers] = useState(1);
  const [extraCapex, setExtraCapex] = useState(20000);
  const [addMonth, setAddMonth] = useState(12);

  const expanded = useMemo(() => {
    if (!open) return null;
    const ratio = (inputs.n_chargers + extraChargers) / Math.max(inputs.n_chargers, 1);
    const newInputs: ProjectInputs = {
      ...inputs,
      n_chargers: inputs.n_chargers + extraChargers,
      n_connectors: inputs.n_connectors,
      avg_monthly_kwh: inputs.avg_monthly_kwh * ratio,
      sessions_per_day: inputs.sessions_per_day * ratio,
    };
    return computeProject({ ...newInputs, other_capex: (inputs.other_capex || 0) + extraCapex });
  }, [open, inputs, extraChargers, extraCapex]);

  return (
    <Card className={`${open ? "print:break-before-page" : "print:hidden"}`}>
      {/* Toggle header — always visible */}
      <button
        className="w-full text-left"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <TrendingUp className="h-4 w-4 text-blue-600 shrink-0" />
              <CardTitle className="text-base">Simulação de Expansão</CardTitle>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[0.7rem] text-muted-foreground hidden sm:block">
                {open ? "Recolher" : "Expandir simulação"}
              </span>
              <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {open
              ? "Simule o impacto de adicionar mais carregadores à infraestrutura existente"
              : "Clique para simular o impacto de expandir a infraestrutura com mais carregadores"}
          </p>
        </CardHeader>
      </button>

      {/* Collapsible content */}
      {open && expanded && (
        <CardContent>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <NumField label="Carregadores adicionais" value={extraChargers} onChange={setExtraChargers} min={1} />
            <NumField label="CAPEX adicional" value={extraCapex} onChange={setExtraCapex} prefix="R$" />
            <NumField label="Mês de instalação" value={addMonth} onChange={setAddMonth} min={1} suffix="º mês"
              hint="Mês do horizonte em que a expansão ocorre" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ["Payback (expansão)", fmtPayback(expanded.payback_months, inputs.horizon_years * 12), expanded.payback_months && expanded.payback_months <= (base.payback_months ?? 999) ? "emerald" : "amber"],
              ["VPL (expansão)", formatCurrency(expanded.npv), expanded.npv >= 0 ? "emerald" : "red"],
              ["Receita mensal (est.)", formatCurrency(expanded.avg_monthly_revenue), "blue"],
              ["FCL mensal (est.)", formatCurrency(expanded.avg_monthly_fcf), expanded.avg_monthly_fcf >= 0 ? "emerald" : "red"],
            ].map(([label, value, color]) => (
              <KpiCard key={label as string} label={label as string} value={value as string} color={color as "slate" | "emerald" | "red" | "blue" | "amber" | "purple"} />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
            <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-3 space-y-1">
              <p className="font-semibold text-muted-foreground uppercase text-[0.65rem]">Base</p>
              <div className="flex justify-between"><span>Carregadores</span><span className="font-medium">{inputs.n_chargers}</span></div>
              <div className="flex justify-between"><span>Payback</span><span className="font-medium">{fmtPayback(base.payback_months, inputs.horizon_years * 12)}</span></div>
              <div className="flex justify-between"><span>VPL</span><span className="font-medium">{formatCurrency(base.npv)}</span></div>
            </div>
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3 space-y-1">
              <p className="font-semibold text-blue-600 uppercase text-[0.65rem]">Expansão</p>
              <div className="flex justify-between"><span>Carregadores</span><span className="font-medium">{inputs.n_chargers + extraChargers}</span></div>
              <div className="flex justify-between"><span>Payback</span><span className="font-medium">{fmtPayback(expanded.payback_months, inputs.horizon_years * 12)}</span></div>
              <div className="flex justify-between"><span>VPL</span><span className="font-medium">{formatCurrency(expanded.npv)}</span></div>
            </div>
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-3 space-y-1">
              <p className="font-semibold text-emerald-600 uppercase text-[0.65rem]">Δ Delta</p>
              <div className="flex justify-between"><span>Carregadores</span><span className="font-medium">+{extraChargers}</span></div>
              <div className="flex justify-between"><span>Payback</span>
                <span className={`font-medium ${(expanded.payback_months ?? 999) < (base.payback_months ?? 999) ? "text-emerald-600" : "text-red-500"}`}>
                  {base.payback_months && expanded.payback_months
                    ? `${expanded.payback_months - base.payback_months > 0 ? "+" : ""}${expanded.payback_months - base.payback_months}m`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between"><span>VPL</span>
                <span className={`font-medium ${expanded.npv - base.npv >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {expanded.npv - base.npv >= 0 ? "+" : ""}{formatCurrency(expanded.npv - base.npv)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
