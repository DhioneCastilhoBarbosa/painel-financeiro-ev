"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Clock, CheckCircle2, Pencil, Bell, ShieldCheck } from "lucide-react";
import { TimeRangeSlider } from "@/components/TimeRangeSlider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import useSWR, { mutate } from "swr";
import { useAuth } from "@/contexts/AuthContext";
import { useAuditLog } from "@/hooks/useAnalytics";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

// Helper to normalize comma as decimal separator
const normalizeDecimal = (v: unknown) =>
  typeof v === "string" ? parseFloat(v.replace(",", ".")) : Number(v);

const numField = z.preprocess(
  (v) => normalizeDecimal(v),
  z.number().min(0)
);
const numFieldPct = z.preprocess(
  (v) => normalizeDecimal(v),
  z.number().min(0).max(100)
);

// Zod schema — % fields stored as DECIMALS on the server (e.g. 2.5 → 0.025 before sending)
const costSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  // OPEX fixos (R$/mês)
  energy_cost_per_kwh:     numField,
  demand_cost:             numField,
  internet_monthly:        numField,
  backend_monthly:         numField,
  preventive_maintenance:  numField,
  corrective_maintenance:  numField,
  rent:                    numField,
  insurance:               numField,
  admin_costs:             numField,
  // OPEX variáveis (%)
  payment_gateway_pct:     numFieldPct,
  default_rate_pct:        numFieldPct,
  // Split
  revenue_split_pct:       numFieldPct,
  revenue_split_base:      z.enum(["revenue", "ebitda", "profit"]),
  // Impostos
  tax_rate_pct:            numFieldPct,
  tax_base:                z.enum(["revenue", "profit"]),
  // Parâmetros financeiros
  depreciation_years: z.preprocess(
    (v) => normalizeDecimal(v),
    z.number().int().min(1).max(30)
  ),
  discount_rate_annual: numFieldPct,
});

type CostData = z.infer<typeof costSchema>;

const COST_DEFAULTS: CostData = {
  name: "Configuração padrão",
  energy_cost_per_kwh:    0.75,
  demand_cost:            0,
  internet_monthly:       0,
  backend_monthly:        0,
  preventive_maintenance: 0,
  corrective_maintenance: 0,
  rent:                   0,
  insurance:              0,
  admin_costs:            0,
  payment_gateway_pct:    2.5,
  default_rate_pct:       1,
  revenue_split_pct:      0,
  revenue_split_base:     "revenue",
  tax_rate_pct:           0,
  tax_base:               "profit",
  depreciation_years:     5,
  discount_rate_annual:   12,
};

interface CostConfig {
  id: string;
  name: string;
  is_default: boolean;
  energy_cost_per_kwh: number;
  demand_cost: number;
  internet_monthly: number;
  backend_monthly: number;
  preventive_maintenance: number;
  corrective_maintenance: number;
  rent: number;
  insurance: number;
  admin_costs: number;
  payment_gateway_pct: number;
  default_rate_pct: number;
  revenue_split_pct: number;
  revenue_split_base: string;
  tax_rate_pct: number;
  tax_base: string;
  depreciation_years: number;
  discount_rate_annual: number;
}

function fmtTime(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

interface AlertItem {
  id: string;
  name: string;
  metric: string;
  operator: string;
  threshold: number;
  channel: string;
  is_active: boolean;
}

const METRIC_LABELS: Record<string, string> = {
  revenue_day: "Receita diária (R$)",
  revenue_session: "Receita por sessão (R$)",
  sessions_day: "Sessões por dia",
  occupancy_pct: "Ocupação (%)",
};

const TIMEZONE_LABELS: Record<string, string> = {
  "America/Sao_Paulo": "América/São Paulo (BRT)",
  "America/Manaus": "América/Manaus (AMT)",
  "America/Fortaleza": "América/Fortaleza (BRT-1)",
  "America/Belem": "América/Belém (BRT)",
  "America/Rio_Branco": "América/Rio Branco (ACT)",
  "UTC": "UTC",
};

const CURRENCY_LABELS: Record<string, string> = {
  BRL: "R$ — Real (BRL)",
  USD: "$ — Dólar (USD)",
  EUR: "€ — Euro (EUR)",
};

const alertSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  metric: z.enum(["revenue_day", "revenue_session", "sessions_day", "occupancy_pct"]),
  operator: z.enum(["below", "above"]),
  threshold: z.preprocess((v) => Number(v), z.number().min(0)),
  channel: z.enum(["email", "in_app"]),
});

type AlertData = z.infer<typeof alertSchema>;

export default function SettingsPage() {
  const { user } = useAuth();
  const canManage = user?.role === "owner" || user?.role === "admin";

  const { data: configs, isLoading } = useSWR<CostConfig[]>("/org/cost-configs", fetcher);
  const { data: org, mutate: mutateOrg } = useSWR<{ settings?: { operating_hours?: number; operating_hours_start?: number; operating_hours_end?: number; timezone?: string; currency?: string } }>("/org", fetcher);
  const { data: alerts, isLoading: alertsLoading } = useSWR<AlertItem[]>(canManage ? "/alerts" : null, fetcher);
  const { data: auditLog } = useAuditLog(200);
  const [auditPage, setAuditPage] = useState(0);
  const AUDIT_PAGE_SIZE = 20;
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activating, setActivating] = useState<string | null>(null);

  // Time range state (minutes from midnight)
  const [startMin, setStartMin] = useState<number>(0);
  const [endMin, setEndMin] = useState<number>(1440);

  useEffect(() => {
    if (!org?.settings) return;
    const s = org.settings;
    if (s.operating_hours_start !== undefined && s.operating_hours_end !== undefined) {
      setStartMin(s.operating_hours_start);
      setEndMin(s.operating_hours_end);
    } else if (s.operating_hours !== undefined) {
      // Backward compat: old single value → start=0, end=hours*60
      setStartMin(0);
      setEndMin(Math.round(s.operating_hours * 60));
    }
  }, [org]);

  const [savingHours, setSavingHours] = useState(false);
  const [savingOrgSettings, setSavingOrgSettings] = useState(false);

  // Alert form state
  const [showAlertForm, setShowAlertForm] = useState(false);
  const [savingAlert, setSavingAlert] = useState(false);
  const [editingAlertId, setEditingAlertId] = useState<string | null>(null);
  const alertForm = useForm<AlertData>({
    resolver: zodResolver(alertSchema),
    defaultValues: { name: "", metric: "revenue_day", operator: "below", threshold: 0, channel: "email" },
  });
  const watchedMetric = alertForm.watch("metric");

  const saveOrgSetting = async (key: string, value: unknown) => {
    setSavingOrgSettings(true);
    try {
      await api.patch("/org", { settings: { [key]: value } });
      await mutateOrg();
      toast.success("Configuração salva");
    } catch {
      toast.error("Erro ao salvar configuração");
    } finally {
      setSavingOrgSettings(false);
    }
  };

  const openNewAlert = () => {
    setEditingAlertId(null);
    alertForm.reset({ name: "", metric: "revenue_day", operator: "below", threshold: 0, channel: "email" });
    setShowAlertForm(true);
  };

  const openEditAlert = (a: AlertItem) => {
    setEditingAlertId(a.id);
    alertForm.reset({
      name: a.name,
      metric: a.metric as AlertData["metric"],
      operator: a.operator as AlertData["operator"],
      threshold: a.threshold,
      channel: a.channel as AlertData["channel"],
    });
    setShowAlertForm(true);
  };

  const saveAlert = async (data: AlertData) => {
    setSavingAlert(true);
    try {
      let savedId: string;
      if (editingAlertId) {
        await api.patch(`/alerts/${editingAlertId}`, data);
        savedId = editingAlertId;
        toast.success("Alerta atualizado");
      } else {
        const { data: created } = await api.post<{ id: string }>("/alerts", data);
        savedId = created.id;
        toast.success("Alerta criado");
      }

      // Evaluate immediately and tell the user if this alert fires on today's data
      try {
        const { data: evalResult } = await api.post<{
          triggered: { id: string; metric: string; operator: string; threshold: number; current_value: number }[];
          metrics: Record<string, number>;
        }>("/alerts/evaluate");
        const fired = evalResult.triggered.find((t) => t.id === savedId);
        if (fired) {
          const METRIC_LABELS: Record<string, string> = {
            revenue_day: "Receita ontem", revenue_session: "Receita/sessão",
            sessions_day: "Sessões ontem", occupancy_pct: "Ocupação",
          };
          toast.warning(
            `Este alerta já está disparado com dados de ontem! ${METRIC_LABELS[fired.metric] ?? fired.metric}: ${fired.current_value.toFixed(1)} ${fired.operator === "below" ? "<" : ">"} ${fired.threshold}`
          );
        }
      } catch {
        // evaluation failure is non-fatal
      }

      alertForm.reset({ name: "", metric: "revenue_day", operator: "below", threshold: 0, channel: "email" });
      setShowAlertForm(false);
      setEditingAlertId(null);
      mutate("/alerts");
    } catch {
      toast.error("Erro ao salvar alerta");
    } finally {
      setSavingAlert(false);
    }
  };

  const toggleAlert = async (id: string, is_active: boolean) => {
    const alert = alerts?.find((a) => a.id === id);
    if (!alert) return;
    try {
      await api.patch(`/alerts/${id}`, { ...alert, is_active });
      mutate("/alerts");
    } catch {
      toast.error("Erro ao atualizar alerta");
    }
  };

  const deleteAlert = async (id: string) => {
    try {
      await api.delete(`/alerts/${id}`);
      toast.success("Alerta removido");
      mutate("/alerts");
    } catch {
      toast.error("Erro ao remover alerta");
    }
  };

  const form = useForm<CostData>({ resolver: zodResolver(costSchema), defaultValues: COST_DEFAULTS });

  const pctToDisplay = (v: number) => Math.round(v * 100 * 10) / 10;

  const openEdit = (c: CostConfig) => {
    setEditingId(c.id);
    setShowForm(true);
    form.reset({
      name: c.name,
      energy_cost_per_kwh:    c.energy_cost_per_kwh,
      demand_cost:            c.demand_cost,
      internet_monthly:       c.internet_monthly,
      backend_monthly:        c.backend_monthly,
      preventive_maintenance: c.preventive_maintenance,
      corrective_maintenance: c.corrective_maintenance,
      rent:                   c.rent,
      insurance:              c.insurance,
      admin_costs:            c.admin_costs,
      payment_gateway_pct:    pctToDisplay(c.payment_gateway_pct),
      default_rate_pct:       pctToDisplay(c.default_rate_pct),
      revenue_split_pct:      pctToDisplay(c.revenue_split_pct),
      revenue_split_base:     (c.revenue_split_base as "revenue" | "ebitda" | "profit") ?? "revenue",
      tax_rate_pct:           pctToDisplay(c.tax_rate_pct),
      tax_base:               (c.tax_base as "revenue" | "profit") ?? "profit",
      depreciation_years:     c.depreciation_years,
      discount_rate_annual:   pctToDisplay(c.discount_rate_annual),
    });
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    form.reset(COST_DEFAULTS);
  };

  const onSave = async (values: CostData) => {
    setCreating(true);
    try {
      const payload = {
        ...values,
        payment_gateway_pct:  values.payment_gateway_pct / 100,
        default_rate_pct:     values.default_rate_pct / 100,
        revenue_split_pct:    values.revenue_split_pct / 100,
        tax_rate_pct:         values.tax_rate_pct / 100,
        discount_rate_annual: values.discount_rate_annual / 100,
        depreciation_years:   Math.round(values.depreciation_years),
      };
      if (editingId) {
        await api.put(`/org/cost-configs/${editingId}`, payload);
        toast.success("Configuração atualizada");
      } else {
        await api.post("/org/cost-configs", payload);
        toast.success("Configuração salva com sucesso");
      }
      cancelForm();
      mutate("/org/cost-configs");
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Erro ao salvar configuração. Verifique os campos.");
    } finally {
      setCreating(false);
    }
  };

  const activateConfig = async (id: string) => {
    setActivating(id);
    try {
      await api.post(`/org/cost-configs/${id}/activate`);
      toast.success("Configuração ativada");
      mutate("/org/cost-configs");
    } catch {
      toast.error("Erro ao ativar configuração");
    } finally {
      setActivating(null);
    }
  };

  const deleteConfig = async (id: string) => {
    if (!confirm("Remover configuração de custo?")) return;
    try {
      await api.delete(`/org/cost-configs/${id}`);
      toast.success("Removida");
      mutate("/org/cost-configs");
    } catch {
      toast.error("Erro ao remover");
    }
  };

  const saveOperatingHours = async () => {
    setSavingHours(true);
    try {
      const hours = (endMin - startMin) / 60;
      await api.patch("/org", {
        settings: {
          operating_hours_start: startMin,
          operating_hours_end: endMin,
          operating_hours: hours,
        },
      });
      toast.success(`Horário atualizado: ${fmtTime(startMin)} – ${fmtTime(endMin)} (${hours.toFixed(1)}h/dia)`);
      mutate("/org");
    } catch {
      toast.error("Erro ao salvar horário");
    } finally {
      setSavingHours(false);
    }
  };

  // Display config with percentages already stored as decimals → show as %
  const displayPct = (v: number) => `${(v * 100).toFixed(1)}%`;

  const effectiveHours = (endMin - startMin) / 60;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Parâmetros de custo e operação</p>
      </div>

      {/* Operating hours */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-600" />
            <CardTitle className="text-base">Horário de Funcionamento</CardTitle>
          </div>
          <CardDescription className="text-xs mt-0.5">
            Impacta no cálculo da taxa de ocupação dos carregadores
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <TimeRangeSlider
              startMin={startMin}
              endMin={endMin}
              onChange={(s, e) => { setStartMin(s); setEndMin(e); }}
            />

            <div className="flex items-center gap-3">
              <p className="text-xs text-muted-foreground flex-1">
                Horas disponíveis por dia = <strong>{effectiveHours.toFixed(1)}h</strong>.
                A taxa de ocupação é calculada como tempo total de carregamento ÷ (dias × {effectiveHours.toFixed(1)}h × 60min).
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={savingHours}
                onClick={saveOperatingHours}
              >
                {savingHours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Salvar"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Existing configs */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Configurações de Custo</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Usadas nos cálculos de DRE e na calculadora de payback. Os percentuais são aplicados sobre a receita líquida.
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => { setEditingId(null); form.reset(COST_DEFAULTS); setShowForm(v => !v); }}>
              <Plus className="h-4 w-4 mr-1" />
              Nova
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : !configs?.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhuma configuração criada. Clique em &quot;Nova&quot; para adicionar.
            </p>
          ) : (
            configs.map((c) => (
              <div
                key={c.id}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                  c.is_default
                    ? "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20"
                    : "border-border opacity-70"
                }`}
              >
                {/* Active indicator */}
                <div className="shrink-0">
                  {c.is_default ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-slate-300 dark:border-slate-600" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{c.name}</p>
                    {c.is_default && (
                      <span className="text-[0.62rem] font-semibold uppercase tracking-wide text-emerald-600 bg-emerald-100 dark:bg-emerald-900 px-1.5 py-0.5 rounded">
                        Ativa
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                    <span>Energia: R${c.energy_cost_per_kwh.toFixed(2)}/kWh</span>
                    <span>Gateway: {displayPct(c.payment_gateway_pct)}</span>
                    {c.revenue_split_pct > 0 && (
                      <span>Split: {displayPct(c.revenue_split_pct)} ({c.revenue_split_base === "revenue" ? "receita" : c.revenue_split_base === "ebitda" ? "EBITDA" : "lucro"})</span>
                    )}
                    {c.tax_rate_pct > 0 && (
                      <span>Imposto: {displayPct(c.tax_rate_pct)} s/{c.tax_base === "revenue" ? "receita" : "lucro"}</span>
                    )}
                    <span>Desconto: {displayPct(c.discount_rate_annual)}/ano</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {!c.is_default && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={activating === c.id}
                      onClick={() => activateConfig(c.id)}
                    >
                      {activating === c.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : "Ativar"}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-500 hover:text-slate-700"
                    onClick={() => openEdit(c)}
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-500 hover:text-red-700"
                    onClick={() => deleteConfig(c.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Create form */}
      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{editingId ? "Editar Configuração de Custo" : "Nova Configuração de Custo"}</CardTitle>
            <CardDescription className="text-xs">
              Percentuais devem ser inseridos como valores inteiros (ex.: &quot;5&quot; para 5%, &quot;8&quot; para 8%). Use vírgula ou ponto como separador decimal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">

                {/* Nome */}
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* ── OPEX Fixos ── */}
                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">OPEX — Custos Fixos (R$/mês)</p>
                <div className="grid grid-cols-2 gap-4">
                  {([
                    ["energy_cost_per_kwh",    "Energia (R$/kWh)",          "ex: 0,75"],
                    ["demand_cost",            "Demanda contratada",        "ex: 300"],
                    ["internet_monthly",       "Internet",                  "ex: 100"],
                    ["backend_monthly",        "Backend/OCPP",              "ex: 150"],
                    ["preventive_maintenance", "Manutenção preventiva",     "ex: 200"],
                    ["corrective_maintenance", "Manutenção corretiva",      "ex: 100"],
                    ["rent",                   "Aluguel fixo",              "ex: 0"],
                    ["insurance",              "Seguro",                    "ex: 100"],
                    ["admin_costs",            "Custos administrativos",    "ex: 200"],
                  ] as [keyof CostData, string, string][]).map(([fname, label, placeholder]) => (
                    <FormField key={fname} control={form.control} name={fname} render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">{label}</FormLabel>
                        <FormControl>
                          <Input type="text" inputMode="decimal" placeholder={placeholder} className="h-8"
                            {...field} value={field.value as string | number}
                            onChange={(e) => field.onChange(e.target.value)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  ))}
                </div>

                {/* ── OPEX Variáveis ── */}
                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">OPEX — Variáveis (% da receita)</p>
                <div className="grid grid-cols-2 gap-4">
                  {([
                    ["payment_gateway_pct", "Gateway de pagamento (%)", "ex: 2,5"],
                    ["default_rate_pct",    "Inadimplência (%)",         "ex: 1"],
                  ] as [keyof CostData, string, string][]).map(([fname, label, placeholder]) => (
                    <FormField key={fname} control={form.control} name={fname} render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">{label}</FormLabel>
                        <FormControl>
                          <Input type="text" inputMode="decimal" placeholder={placeholder} className="h-8"
                            {...field} value={field.value as string | number}
                            onChange={(e) => field.onChange(e.target.value)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  ))}
                </div>

                {/* ── Split ── */}
                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Split</p>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="revenue_split_pct" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Split %</FormLabel>
                      <FormControl>
                        <Input type="text" inputMode="decimal" placeholder="ex: 10" className="h-8"
                          {...field} value={field.value as string | number}
                          onChange={(e) => field.onChange(e.target.value)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="revenue_split_base" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Base de cálculo</FormLabel>
                      <Select value={field.value as string} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="revenue">Receita bruta</SelectItem>
                          <SelectItem value="ebitda">EBITDA</SelectItem>
                          <SelectItem value="profit">Lucro líquido</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* ── Impostos ── */}
                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Impostos</p>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="tax_rate_pct" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Alíquota (%)</FormLabel>
                      <FormControl>
                        <Input type="text" inputMode="decimal" placeholder="ex: 6" className="h-8"
                          {...field} value={field.value as string | number}
                          onChange={(e) => field.onChange(e.target.value)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="tax_base" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Regime tributário</FormLabel>
                      <Select value={field.value as string} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="revenue">Simples Nacional (s/ receita)</SelectItem>
                          <SelectItem value="profit">Lucro Presumido / Real (s/ lucro)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* ── Parâmetros Financeiros ── */}
                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Parâmetros Financeiros</p>
                <div className="grid grid-cols-2 gap-4">
                  {([
                    ["depreciation_years",  "Depreciação (anos)",        "ex: 5"],
                    ["discount_rate_annual","Taxa de desconto anual (%)", "ex: 12"],
                  ] as [keyof CostData, string, string][]).map(([fname, label, placeholder]) => (
                    <FormField key={fname} control={form.control} name={fname} render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">{label}</FormLabel>
                        <FormControl>
                          <Input type="text" inputMode="decimal" placeholder={placeholder} className="h-8"
                            {...field} value={field.value as string | number}
                            onChange={(e) => field.onChange(e.target.value)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  ))}
                </div>

                <div className="flex gap-3 pt-2">
                  <Button type="submit" disabled={creating}>
                    {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar
                  </Button>
                  <Button type="button" variant="outline" onClick={cancelForm}>
                    Cancelar
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* ── Preferências da Organização ─────────────────── */}
      <Separator />
      <div>
        <h2 className="text-base font-semibold mb-4">Preferências</h2>
        <Card>
          <CardContent className="pt-6 space-y-5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-medium">Fuso horário</p>
                <p className="text-xs text-muted-foreground mt-0.5">Usado em relatórios e exportações</p>
              </div>
              <Select
                value={org?.settings?.timezone ?? "America/Sao_Paulo"}
                onValueChange={(v) => saveOrgSetting("timezone", v)}
                disabled={!canManage || savingOrgSettings}
              >
                <SelectTrigger className="w-56">
                  <SelectValue>
                    {TIMEZONE_LABELS[org?.settings?.timezone ?? "America/Sao_Paulo"] ?? (org?.settings?.timezone ?? "América/São Paulo (BRT)")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/Sao_Paulo">América/São Paulo (BRT)</SelectItem>
                  <SelectItem value="America/Manaus">América/Manaus (AMT)</SelectItem>
                  <SelectItem value="America/Fortaleza">América/Fortaleza (BRT-1)</SelectItem>
                  <SelectItem value="America/Belem">América/Belém (BRT)</SelectItem>
                  <SelectItem value="America/Rio_Branco">América/Rio Branco (ACT)</SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-medium">Formato de moeda</p>
                <p className="text-xs text-muted-foreground mt-0.5">Exibição nos dashboards e exportações</p>
              </div>
              <Select
                value={org?.settings?.currency ?? "BRL"}
                onValueChange={(v) => saveOrgSetting("currency", v)}
                disabled={!canManage || savingOrgSettings}
              >
                <SelectTrigger className="w-48">
                  <SelectValue>
                    {CURRENCY_LABELS[org?.settings?.currency ?? "BRL"] ?? (org?.settings?.currency ?? "R$ — Real (BRL)")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRL">R$ — Real (BRL)</SelectItem>
                  <SelectItem value="USD">$ — Dólar (USD)</SelectItem>
                  <SelectItem value="EUR">€ — Euro (EUR)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Alertas Configuráveis ─────────────────────────── */}
      {canManage && (
        <>
          <Separator />
          <div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-semibold">Alertas</h2>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={openNewAlert}>
                <Plus className="h-3.5 w-3.5" />
                Novo alerta
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Alertas de e-mail são enviados ao proprietário da organização. Alertas de Dashboard aparecem no sino 🔔 no topo.
            </p>

            {/* Alert list */}
            <Card>
              <CardContent className="pt-4 space-y-1">
                {alertsLoading ? (
                  <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}</div>
                ) : (alerts?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum alerta configurado.</p>
                ) : alerts?.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                    {/* Toggle */}
                    <button
                      onClick={() => toggleAlert(a.id, !a.is_active)}
                      className={cn(
                        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                        a.is_active ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"
                      )}
                      aria-label="Ativar/desativar"
                    >
                      <span className={cn(
                        "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform",
                        a.is_active ? "translate-x-4" : "translate-x-0"
                      )} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {METRIC_LABELS[a.metric] ?? a.metric}
                        {" "}{a.operator === "below" ? "abaixo de" : "acima de"}{" "}
                        <strong>{a.threshold}{a.metric === "occupancy_pct" ? "%" : ""}</strong>
                        {" · "}{a.channel === "email" ? "E-mail" : "Dashboard"}
                      </p>
                    </div>
                    {!a.is_active && <Badge variant="secondary" className="text-xs shrink-0">Inativo</Badge>}
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-slate-500"
                      onClick={() => openEditAlert(a)}
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-red-500"
                      onClick={() => deleteAlert(a.id)}
                      title="Remover"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Alert form (create or edit) */}
            {showAlertForm && (
              <Card className="mt-3 border-blue-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    {editingAlertId ? "Editar alerta" : "Novo alerta"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Form {...alertForm}>
                    <form onSubmit={alertForm.handleSubmit(saveAlert)} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField control={alertForm.control} name="name" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nome</FormLabel>
                            <FormControl><Input placeholder="ex: Receita baixa" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />

                        <FormField control={alertForm.control} name="metric" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Métrica</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione a métrica">
                                    {METRIC_LABELS[field.value] ?? field.value}
                                  </SelectValue>
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {Object.entries(METRIC_LABELS).map(([k, v]) => (
                                  <SelectItem key={k} value={k}>{v}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )} />

                        <FormField control={alertForm.control} name="operator" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Condição</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione">
                                    {field.value === "below" ? "Abaixo de" : field.value === "above" ? "Acima de" : ""}
                                  </SelectValue>
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="below">Abaixo de</SelectItem>
                                <SelectItem value="above">Acima de</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )} />

                        <FormField control={alertForm.control} name="threshold" render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Valor{watchedMetric === "occupancy_pct" ? " (%)" : watchedMetric === "sessions_day" ? " (sessões)" : " (R$)"}
                            </FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input type="number" step="0.01" min="0" {...field} className={watchedMetric === "occupancy_pct" ? "pr-8" : ""} />
                                {watchedMetric === "occupancy_pct" && (
                                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">%</span>
                                )}
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />

                        <FormField control={alertForm.control} name="channel" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Canal de notificação</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione">
                                    {field.value === "email" ? "E-mail" : field.value === "in_app" ? "Dashboard (sino 🔔)" : ""}
                                  </SelectValue>
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="email">E-mail</SelectItem>
                                <SelectItem value="in_app">Dashboard (sino 🔔)</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )} />
                      </div>
                      <div className="flex gap-3">
                        <Button type="submit" size="sm" disabled={savingAlert}>
                          {savingAlert && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                          {editingAlertId ? "Salvar alterações" : "Criar alerta"}
                        </Button>
                        <Button
                          type="button" size="sm" variant="outline"
                          onClick={() => { setShowAlertForm(false); setEditingAlertId(null); }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}

      {/* Audit log */}
      {canManage && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Log de Auditoria</CardTitle>
            </div>
            <CardDescription>Últimas ações realizadas na organização</CardDescription>
          </CardHeader>
          <CardContent>
            {!auditLog ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => <div key={i} className="h-8 bg-muted rounded animate-pulse" />)}
              </div>
            ) : auditLog.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma ação registrada ainda.</p>
            ) : (() => {
              type AuditEntry = { id: string; user_email: string; action: string; entity_type: string | null; entity_id: string | null; details: string | null; created_at: string };
              const totalPages = Math.ceil(auditLog.length / AUDIT_PAGE_SIZE);
              const pageEntries: AuditEntry[] = auditLog.slice(auditPage * AUDIT_PAGE_SIZE, (auditPage + 1) * AUDIT_PAGE_SIZE);
              return (
                <>
                  <div className="divide-y dark:divide-slate-800 text-xs">
                    {pageEntries.map((entry: AuditEntry) => (
                      <div key={entry.id} className="flex items-start gap-3 py-2.5">
                        <div className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                          <ShieldCheck className="h-3 w-3 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground">
                            <span className="text-blue-600 dark:text-blue-400">{entry.user_email}</span>
                            {" · "}<span className="font-mono">{entry.action}</span>
                            {entry.entity_type && <span className="text-muted-foreground"> ({entry.entity_type}{entry.entity_id ? ` ${entry.entity_id.slice(0, 8)}` : ""})</span>}
                          </p>
                          {entry.details && (
                            <p className="text-muted-foreground truncate">{entry.details}</p>
                          )}
                        </div>
                        <time className="shrink-0 text-muted-foreground tabular-nums">
                          {new Date(entry.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                          {" "}
                          {new Date(entry.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </time>
                      </div>
                    ))}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-3 border-t dark:border-slate-800 text-xs text-muted-foreground">
                      <span>{auditPage * AUDIT_PAGE_SIZE + 1}–{Math.min((auditPage + 1) * AUDIT_PAGE_SIZE, auditLog.length)} de {auditLog.length}</span>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={auditPage === 0} onClick={() => setAuditPage(p => p - 1)}>Anterior</Button>
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={auditPage >= totalPages - 1} onClick={() => setAuditPage(p => p + 1)}>Próxima</Button>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
