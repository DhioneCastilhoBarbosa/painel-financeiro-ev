"use client";

import { PlanGate } from "@/components/PlanGate";
import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Zap, TrendingUp, Wallet,
  CheckCircle2, Clock, AlertCircle, X, Save, Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const fetcher = (url: string) => api.get(url).then((r) => r.data);
const SWR_OPTS = { revalidateOnFocus: false };
const GREEN = "#06CB3F";
const DARK  = "#163134";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtPct(v: number) {
  return `${v.toFixed(1)}%`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CapexPerformance {
  months_elapsed: number;
  revenue_total: number;
  monthly_revenue_avg: number;
  opex_total: number;
  tax_total: number;
  net_total: number;
  cumulative: number;
  payback_months: number | null;
  months_remaining: number | null;
  progress_pct: number;
  data_source: "sessions" | "estimate" | "none";
  sessions_count: number;
}

interface ChargerCapex {
  id: string;
  name: string;
  charger_type: string | null;
  num_chargers: number;
  station_key: string | null;
  capex_brl: number;
  opex_pct: number;
  tax_pct: number;
  monthly_revenue_est: number | null;
  installed_at: string;
  notes: string | null;
  performance: CapexPerformance;
}

// ── Empty form ─────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: "",
  charger_type: "",
  num_chargers: 1,
  station_key: "",
  capex_brl: "",
  opex_pct: 25,
  tax_pct: 0,
  monthly_revenue_est: "",
  installed_at: new Date().toISOString().slice(0, 10),
  notes: "",
};

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ p }: { p: CapexPerformance }) {
  if (p.data_source === "none" || p.months_elapsed === 0)
    return <Badge variant="secondary">Sem dados</Badge>;
  if (p.cumulative >= 0)
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200 gap-1">
        <CheckCircle2 className="h-3 w-3" /> Payback atingido
      </Badge>
    );
  return (
    <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1">
      <Clock className="h-3 w-3" />
      {p.months_remaining !== null ? `${p.months_remaining.toFixed(0)} meses restantes` : "Em progresso"}
    </Badge>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CapexPage() {
  return (
    <PlanGate feature="capex">
      <CapexPageContent />
    </PlanGate>
  );
}

function CapexPageContent() {
  const { user } = useAuth();
  const { data, isLoading, mutate } = useSWR<ChargerCapex[]>("/capex", fetcher, SWR_OPTS);

  const [showForm, setShowForm]   = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [form, setForm]           = useState({ ...EMPTY_FORM });
  const [saving, setSaving]       = useState(false);
  const [deleting, setDeleting]   = useState<string | null>(null);

  if (!user) return null;

  // ── Totals ─────────────────────────────────────────────────────────────────
  const records = data ?? [];
  const totalCapex    = records.reduce((s, r) => s + r.capex_brl, 0);
  const totalRevenue  = records.reduce((s, r) => s + r.performance.revenue_total, 0);
  const totalNet      = records.reduce((s, r) => s + r.performance.net_total, 0);
  const totalCumul    = records.reduce((s, r) => s + r.performance.cumulative, 0);
  const recovered     = totalCapex > 0 ? Math.min(100, (totalNet / totalCapex) * 100) : 0;

  // ── Form helpers ───────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  };

  const openEdit = (r: ChargerCapex) => {
    setEditId(r.id);
    setForm({
      name: r.name,
      charger_type: r.charger_type ?? "",
      num_chargers: r.num_chargers,
      station_key: r.station_key ?? "",
      capex_brl: String(r.capex_brl),
      opex_pct: +(r.opex_pct * 100).toFixed(1),
      tax_pct: +(r.tax_pct * 100).toFixed(1),
      monthly_revenue_est: r.monthly_revenue_est != null ? String(r.monthly_revenue_est) : "",
      installed_at: r.installed_at.slice(0, 10),
      notes: r.notes ?? "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.capex_brl || !form.installed_at) {
      toast.error("Preencha nome, CAPEX e data de instalação");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name:               form.name.trim(),
        charger_type:       form.charger_type.trim() || null,
        num_chargers:       Number(form.num_chargers),
        station_key:        form.station_key.trim() || null,
        capex_brl:          parseFloat(String(form.capex_brl)),
        opex_pct:           Number(form.opex_pct) / 100,
        tax_pct:            Number(form.tax_pct) / 100,
        monthly_revenue_est: form.monthly_revenue_est ? parseFloat(String(form.monthly_revenue_est)) : null,
        installed_at:       form.installed_at,
        notes:              form.notes.trim() || null,
      };
      if (editId) {
        await api.put(`/capex/${editId}`, payload);
        toast.success("Registro atualizado");
      } else {
        await api.post("/capex", payload);
        toast.success("Carregador registrado");
      }
      mutate();
      setShowForm(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await api.delete(`/capex/${id}`);
      toast.success("Registro removido");
      mutate();
    } catch {
      toast.error("Erro ao remover");
    } finally {
      setDeleting(null);
    }
  };

  const setF = (k: keyof typeof EMPTY_FORM, v: unknown) =>
    setForm((p) => ({ ...p, [k]: v as string }));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">CAPEX por Carregador</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Registre o investimento por carregador e acompanhe o payback real com base nos dados de sessão.
          </p>
        </div>
        <Button onClick={openAdd} className="gap-1.5" style={{ backgroundColor: DARK, color: "white" }}>
          <Plus className="h-4 w-4" /> Adicionar carregador
        </Button>
      </div>

      {/* Summary KPIs */}
      {records.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "CAPEX total investido",  value: fmtBRL(totalCapex),   color: "text-foreground" },
            { label: "Receita acumulada",       value: fmtBRL(totalRevenue), color: "text-emerald-600 dark:text-emerald-400" },
            { label: "Lucro líquido acumulado", value: fmtBRL(totalNet),     color: totalNet >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400" },
            { label: "Posição vs CAPEX",        value: fmtBRL(totalCumul),   color: totalCumul >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400" },
          ].map(({ label, value, color }) => (
            <Card key={label}>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Global progress */}
      {records.length > 0 && totalCapex > 0 && (
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold" style={{ color: DARK }}>Progresso geral de recuperação do CAPEX</p>
              <span className="text-sm font-bold" style={{ color: recovered >= 100 ? GREEN : undefined }}>
                {recovered.toFixed(1)}%
              </span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, recovered)}%`, backgroundColor: GREEN }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>R$ 0</span>
              <span>{fmtBRL(totalCapex)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cards por carregador */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 w-full" />)}
        </div>
      ) : records.length === 0 ? (
        <div className="py-24 text-center text-muted-foreground border-2 border-dashed rounded-2xl">
          <Wallet className="h-12 w-12 mx-auto mb-4 opacity-20" />
          <p className="font-medium">Nenhum carregador registrado</p>
          <p className="text-sm mt-1 mb-6">
            Registre o CAPEX de cada carregador para acompanhar o payback real.
          </p>
          <Button onClick={openAdd} style={{ backgroundColor: DARK, color: "white" }}>
            <Plus className="h-4 w-4 mr-1.5" /> Adicionar primeiro carregador
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {records.map((r) => {
            const p = r.performance;
            const isRecovered = p.cumulative >= 0;
            return (
              <Card key={r.id} className="overflow-hidden">
                {/* Card header */}
                <div
                  className="px-5 pt-5 pb-3 border-b"
                  style={{ borderColor: isRecovered ? `${GREEN}40` : undefined }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold truncate" style={{ color: DARK }}>{r.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {r.charger_type && <span>{r.charger_type} · </span>}
                        {r.num_chargers} {r.num_chargers === 1 ? "ponto" : "pontos"}
                        {r.station_key && <span> · vinculado a "{r.station_key}"</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEdit(r)}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        disabled={deleting === r.id}
                        className="p-1.5 rounded-lg hover:bg-red-50 hover:text-red-500 transition-colors text-muted-foreground"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2">
                    <StatusBadge p={p} />
                  </div>
                </div>

                <CardContent className="pt-4 space-y-3">
                  {/* Metrics grid */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "CAPEX investido",  value: fmtBRL(r.capex_brl),     color: "text-foreground" },
                      { label: "Receita acumulada", value: fmtBRL(p.revenue_total), color: "text-emerald-600 dark:text-emerald-400" },
                      { label: "OPEX + Impostos",   value: fmtBRL(p.opex_total + p.tax_total), color: "text-orange-500 dark:text-orange-400" },
                      { label: "Lucro líquido",     value: fmtBRL(p.net_total),     color: p.net_total >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400" },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-muted/40 rounded-lg p-2.5">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className={`font-bold text-sm mt-0.5 ${color}`}>{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Payback progress */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">
                        {p.payback_months
                          ? `Payback estimado: ${p.payback_months.toFixed(0)} meses`
                          : p.data_source === "none"
                            ? "Vincule dados ou insira receita estimada"
                            : "Payback não calculável (sem lucro)"}
                      </span>
                      <span className="font-semibold" style={{ color: isRecovered ? GREEN : undefined }}>
                        {p.progress_pct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, p.progress_pct)}%`,
                          backgroundColor: isRecovered ? GREEN : "#f59e0b",
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>Instalado: {new Date(r.installed_at + "T12:00:00").toLocaleDateString("pt-BR")}</span>
                      <span>{p.months_elapsed.toFixed(0)} meses em operação</span>
                    </div>
                  </div>

                  {/* Receita mensal média */}
                  {p.monthly_revenue_avg > 0 && (
                    <div className="flex items-center justify-between pt-2 border-t text-xs">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        {p.data_source === "sessions" ? "Receita/mês (últimos 90 dias)" : "Receita/mês estimada"}
                      </span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">{fmtBRL(p.monthly_revenue_avg)}</span>
                    </div>
                  )}

                  {/* Data source */}
                  {p.data_source === "estimate" && (
                    <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      Usando receita estimada. Vincule uma estação para dados reais.
                    </div>
                  )}
                  {p.data_source === "sessions" && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg px-3 py-2">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      {p.sessions_count.toLocaleString("pt-BR")} sessões reais importadas
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Form modal / slide-over ──────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowForm(false)} />

          {/* Panel */}
          <div className="relative ml-auto w-full max-w-lg bg-background shadow-2xl overflow-y-auto">
            {/* Header */}
            <div
              className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b bg-background"
            >
              <h2 className="font-bold text-lg" style={{ color: DARK }}>
                {editId ? "Editar carregador" : "Novo carregador"}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Nome */}
              <div>
                <label className="text-sm font-semibold block mb-1.5" style={{ color: DARK }}>
                  Nome do carregador / grupo *
                </label>
                <Input
                  placeholder="Ex: Estação Shopping A - DC 60kW"
                  value={form.name}
                  onChange={(e) => setF("name", e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Tipo */}
                <div>
                  <label className="text-sm font-semibold block mb-1.5" style={{ color: DARK }}>Tipo de carregador</label>
                  <Input placeholder="DC 60 kW" value={form.charger_type} onChange={(e) => setF("charger_type", e.target.value)} />
                </div>
                {/* Pontos */}
                <div>
                  <label className="text-sm font-semibold block mb-1.5" style={{ color: DARK }}>Nº de pontos</label>
                  <Input type="number" min={1} value={form.num_chargers} onChange={(e) => setF("num_chargers", e.target.value)} />
                </div>
              </div>

              {/* CAPEX */}
              <div>
                <label className="text-sm font-semibold block mb-1.5" style={{ color: DARK }}>
                  CAPEX total (R$) *
                </label>
                <Input
                  type="number" min={0} step={100}
                  placeholder="75000"
                  value={form.capex_brl}
                  onChange={(e) => setF("capex_brl", e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* OPEX */}
                <div>
                  <label className="text-sm font-semibold block mb-1.5" style={{ color: DARK }}>OPEX (%)</label>
                  <Input type="number" min={0} max={100} step={0.1} value={form.opex_pct}
                    onChange={(e) => setF("opex_pct", e.target.value)} />
                </div>
                {/* Imposto */}
                <div>
                  <label className="text-sm font-semibold block mb-1.5" style={{ color: DARK }}>Impostos (%)</label>
                  <Input type="number" min={0} max={100} step={0.1} value={form.tax_pct}
                    onChange={(e) => setF("tax_pct", e.target.value)} />
                </div>
              </div>

              {/* Data instalação */}
              <div>
                <label className="text-sm font-semibold block mb-1.5" style={{ color: DARK }}>
                  Data de início de operação *
                </label>
                <Input type="date" value={form.installed_at} onChange={(e) => setF("installed_at", e.target.value)} />
              </div>

              {/* Station key */}
              <div>
                <label className="text-sm font-semibold block mb-1.5" style={{ color: DARK }}>
                  Vincular a estação dos dados <span className="font-normal text-muted-foreground">(opcional)</span>
                </label>
                <Input
                  placeholder="Nome exato da estação nos arquivos CSV"
                  value={form.station_key}
                  onChange={(e) => setF("station_key", e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Quando vinculado, o payback é calculado com dados reais das sessões importadas.
                </p>
              </div>

              {/* Receita estimada */}
              <div>
                <label className="text-sm font-semibold block mb-1.5" style={{ color: DARK }}>
                  Receita mensal estimada (R$) <span className="font-normal text-muted-foreground">(opcional)</span>
                </label>
                <Input
                  type="number" min={0} step={100}
                  placeholder="9800"
                  value={form.monthly_revenue_est}
                  onChange={(e) => setF("monthly_revenue_est", e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Usado como fallback quando não há estação vinculada.
                </p>
              </div>

              {/* Observações */}
              <div>
                <label className="text-sm font-semibold block mb-1.5" style={{ color: DARK }}>
                  Observações <span className="font-normal text-muted-foreground">(opcional)</span>
                </label>
                <textarea
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-input text-sm resize-none focus:outline-none focus:ring-2"
                  placeholder="Localização, modelo do equipamento, responsável..."
                  value={form.notes}
                  onChange={(e) => setF("notes", e.target.value)}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 gap-1.5"
                  style={{ backgroundColor: DARK, color: "white" }}
                  onClick={handleSave}
                  disabled={saving}
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Salvando…" : "Salvar"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
