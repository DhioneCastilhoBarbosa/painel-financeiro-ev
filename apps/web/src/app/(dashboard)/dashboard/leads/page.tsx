"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  Download, Search, Mail, Phone,
  Zap, TrendingUp, ChevronDown, ChevronUp,
  Trash2, Plus, Settings, MessageSquare, MessageSquareText,
  Save, ChevronRight, Activity, MapPin, Users2, BarChart2,
  Calendar,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { canViewLeads, canManageLeads } from "@/lib/permissions";
import { formatDate } from "@/lib/format";

const fetcher = (url: string) => api.get(url).then((r) => r.data);
const SWR_OPTS = { revalidateOnFocus: false };

const GREEN = "#06CB3F";
const DARK  = "#163134";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

// ── State full names ──────────────────────────────────────────────────────────
const STATE_NAMES: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia",
  CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul",
  RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo",
  SE: "Sergipe", TO: "Tocantins",
};

type AnalyticsPeriod = "week" | "month" | "quarter" | "custom";

function fmtAxisDate(iso: string): string {
  const [, m, day] = iso.split("-");
  return `${day}/${m}`;
}

// ── BR state list (for email config) ─────────────────────────────────────────
const BR_STATES = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA",
  "MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN",
  "RS","RO","RR","SC","SP","SE","TO",
];

// ── Interfaces ────────────────────────────────────────────────────────────────
interface Lead {
  id: string; name: string; email: string; phone: string;
  cnpj: string | null; state: string; city: string;
  charger_type: string; sector: string; position: string;
  num_chargers: number; monthly_revenue: number;
  payback_months: number | null; roi_5y_pct: number;
  message: string | null; specialist_message: string | null;
  created_at: string;
}
interface NotifEmail {
  id: string; email: string; name: string | null;
  is_active: boolean; states: string[];
}
interface ChargerConfig {
  price_brl: number; power_kw: number;
  avg_sessions_day: number; avg_duration_min: number;
}
interface SimulatorConfig {
  id: string; charger_configs: Record<string, ChargerConfig>;
  price_per_kwh: number; opex_pct: number;
  growth_pct_month: number; discount_rate_annual: number;
  projection_years: number;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const { user } = useAuth();

  // ── Tab & filter state ──────────────────────────────────────────────────────
  const [search, setSearch]             = useState("");
  const [filterState, setFilterState]   = useState("");
  const [filterSector, setFilterSector] = useState("");
  const [filterCharger, setFilterCharger] = useState("");
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [activeTab, setActiveTab]       = useState<"leads" | "analytics" | "config">("leads");

  // ── Analytics period filter ─────────────────────────────────────────────────
  const [analyticsPeriod, setAnalyticsPeriod] = useState<AnalyticsPeriod>("month");
  const [customFrom, setCustomFrom]     = useState("");
  const [customTo, setCustomTo]         = useState("");

  // ── Email config state ──────────────────────────────────────────────────────
  const [newEmail, setNewEmail]         = useState("");
  const [newEmailName, setNewEmailName] = useState("");
  const [newEmailStates, setNewEmailStates] = useState<string[]>([]);
  const [addingEmail, setAddingEmail]   = useState(false);
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);
  const [editingStates, setEditingStates] = useState<Record<string, string[]>>({});
  const [savingEmailId, setSavingEmailId] = useState<string | null>(null);

  // ── Simulator config state ──────────────────────────────────────────────────
  const [editingConfig, setEditingConfig] = useState(false);
  const [configDraft, setConfigDraft]   = useState<SimulatorConfig | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  const manageLeads = canManageLeads(user);

  // ── SWR ────────────────────────────────────────────────────────────────────
  const queryStr = new URLSearchParams({
    ...(filterState   && { state:        filterState }),
    ...(filterSector  && { sector:       filterSector }),
    ...(filterCharger && { charger_type: filterCharger }),
  }).toString();

  const { data: leads, isLoading } = useSWR<Lead[]>(
    `/leads?${queryStr}`, fetcher, SWR_OPTS,
  );

  // Separate full fetch (no filters, up to 1000) for analytics
  const { data: allLeads } = useSWR<Lead[]>(
    "/leads?limit=1000", fetcher, SWR_OPTS,
  );

  const { data: notifEmails, mutate: mutateEmails } = useSWR<NotifEmail[]>(
    manageLeads ? "/leads/config/notification-emails" : null, fetcher, SWR_OPTS,
  );
  const { data: simConfig, mutate: mutateConfig } = useSWR<SimulatorConfig>(
    manageLeads ? "/leads/config/simulator" : null, fetcher, SWR_OPTS,
  );

  // ── Access guard ────────────────────────────────────────────────────────────
  if (!user || !canViewLeads(user)) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Você não tem permissão para acessar os leads.</p>
      </div>
    );
  }

  // ── Analytics computation ───────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const analytics = useMemo(() => {
    const raw = allLeads ?? [];

    // Compute date window boundaries
    const now = new Date();
    let windowStart: Date;
    let windowEnd: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    if (analyticsPeriod === "week") {
      windowStart = new Date(now);
      windowStart.setDate(now.getDate() - 6);
      windowStart.setHours(0, 0, 0, 0);
    } else if (analyticsPeriod === "quarter") {
      windowStart = new Date(now);
      windowStart.setDate(now.getDate() - 89);
      windowStart.setHours(0, 0, 0, 0);
    } else if (analyticsPeriod === "custom" && customFrom) {
      windowStart = new Date(customFrom + "T00:00:00");
      if (customTo) windowEnd = new Date(customTo + "T23:59:59");
    } else {
      // month (default)
      windowStart = new Date(now);
      windowStart.setDate(now.getDate() - 29);
      windowStart.setHours(0, 0, 0, 0);
    }

    const fromIso = windowStart.toISOString().slice(0, 10);
    const toIso   = windowEnd.toISOString().slice(0, 10);

    // Filtered leads for the selected period
    const all = raw.filter((l) => {
      const d = l.created_at.slice(0, 10);
      return d >= fromIso && d <= toIso;
    });

    // Build day-by-day trend keys for the window
    const trendDays: string[] = [];
    const cur = new Date(windowStart);
    while (cur <= windowEnd) {
      trendDays.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
    const trend = trendDays.map((d) => ({
      date: d,
      leads: all.filter((l) => l.created_at.slice(0, 10) === d).length,
    }));

    // By state
    const stateCounts: Record<string, number> = {};
    all.forEach((l) => { stateCounts[l.state] = (stateCounts[l.state] ?? 0) + 1; });
    const maxStateCount = Math.max(...Object.values(stateCounts), 1);

    // Top states (for bar chart)
    const topStates = Object.entries(stateCounts)
      .map(([uf, count]) => ({ uf, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // By charger type
    const chargerMap: Record<string, { count: number; points: number; revenue: number }> = {};
    all.forEach((l) => {
      if (!chargerMap[l.charger_type])
        chargerMap[l.charger_type] = { count: 0, points: 0, revenue: 0 };
      chargerMap[l.charger_type].count++;
      chargerMap[l.charger_type].points   += l.num_chargers;
      chargerMap[l.charger_type].revenue  += l.monthly_revenue;
    });
    const chargers = Object.entries(chargerMap)
      .map(([type, d]) => ({
        type,
        count:      d.count,
        points:     d.points,
        avgRevenue: d.count > 0 ? d.revenue / d.count : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // By sector
    const sectorMap: Record<string, { count: number; points: number }> = {};
    all.forEach((l) => {
      if (!sectorMap[l.sector]) sectorMap[l.sector] = { count: 0, points: 0 };
      sectorMap[l.sector].count++;
      sectorMap[l.sector].points += l.num_chargers;
    });
    const sectors = Object.entries(sectorMap)
      .map(([name, d]) => ({ name, count: d.count, points: d.points }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 9);

    // By city
    const cityMap: Record<string, number> = {};
    all.forEach((l) => {
      const key = `${l.city} (${l.state})`;
      cityMap[key] = (cityMap[key] ?? 0) + 1;
    });
    const cities = Object.entries(cityMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // KPIs
    const weekAgo  = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    const thisWeek = all.filter((l) => l.created_at.slice(0, 10) >= weekAgo).length;
    const withSpec = all.filter((l) => l.specialist_message).length;
    const specialistRate = all.length > 0 ? (withSpec / all.length) * 100 : 0;
    const totalRevenue   = all.reduce((s, l) => s + l.monthly_revenue, 0);
    const topState       = topStates[0];

    // Pontos totais demandados
    const totalPoints = all.reduce((s, l) => s + l.num_chargers, 0);

    return {
      trend, stateCounts, maxStateCount, topStates,
      chargers, sectors, cities,
      thisWeek, specialistRate, totalRevenue, topState, totalPoints,
      total: all.length,
    };
  }, [allLeads, analyticsPeriod, customFrom, customTo]);

  // ── Filter helpers ──────────────────────────────────────────────────────────
  const allStateFilters  = [...new Set(leads?.map((l) => l.state)  ?? [])].sort();
  const allSectorFilters = [...new Set(leads?.map((l) => l.sector) ?? [])].sort();
  const allChargerFilters= [...new Set(leads?.map((l) => l.charger_type) ?? [])].sort();

  const filtered = (leads ?? []).filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return l.name.toLowerCase().includes(q) ||
           l.email.toLowerCase().includes(q) ||
           l.city.toLowerCase().includes(q);
  });

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleExport = () =>
    window.open(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/leads/export`,
      "_blank",
    );

  const handleAddEmail = async () => {
    if (!newEmail.trim()) return;
    setAddingEmail(true);
    try {
      await api.post("/leads/config/notification-emails", {
        email: newEmail.trim(), name: newEmailName.trim() || null, states: newEmailStates,
      });
      toast.success("E-mail adicionado");
      setNewEmail(""); setNewEmailName(""); setNewEmailStates([]);
      mutateEmails();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Erro ao adicionar e-mail");
    } finally { setAddingEmail(false); }
  };

  const handleRemoveEmail = async (id: string) => {
    try {
      await api.delete(`/leads/config/notification-emails/${id}`);
      toast.success("E-mail removido"); mutateEmails();
    } catch { toast.error("Erro ao remover e-mail"); }
  };

  const handleSaveEmailStates = async (id: string) => {
    setSavingEmailId(id);
    try {
      await api.patch(`/leads/config/notification-emails/${id}`, { states: editingStates[id] ?? [] });
      toast.success("Configuração salva"); mutateEmails(); setExpandedEmailId(null);
    } catch { toast.error("Erro ao salvar"); }
    finally { setSavingEmailId(null); }
  };

  const toggleEmailState = (emailId: string, uf: string) =>
    setEditingStates((prev) => {
      const current = prev[emailId] ?? [];
      return { ...prev, [emailId]: current.includes(uf) ? current.filter((s) => s !== uf) : [...current, uf] };
    });

  const startEditingEmail = (e: NotifEmail) => {
    setExpandedEmailId(e.id);
    setEditingStates((prev) => ({ ...prev, [e.id]: [...(e.states ?? [])] }));
  };

  const startEditingConfig = () => {
    if (!simConfig) return;
    setConfigDraft(JSON.parse(JSON.stringify(simConfig)));
    setEditingConfig(true);
  };

  const handleSaveConfig = async () => {
    if (!configDraft) return;
    setSavingConfig(true);
    try {
      await api.put("/leads/config/simulator", {
        charger_configs: configDraft.charger_configs,
        price_per_kwh:      configDraft.price_per_kwh,
        opex_pct:           configDraft.opex_pct,
        growth_pct_month:   configDraft.growth_pct_month,
        discount_rate_annual: configDraft.discount_rate_annual,
        projection_years:   configDraft.projection_years,
      });
      toast.success("Configurações do simulador salvas");
      mutateConfig(); setEditingConfig(false); setConfigDraft(null);
    } catch { toast.error("Erro ao salvar configurações"); }
    finally { setSavingConfig(false); }
  };

  const activeConfig = editingConfig && configDraft ? configDraft : simConfig;

  // Summary stats (for the Leads tab header)
  const total     = filtered.length;
  const avgRevenue = total > 0 ? filtered.reduce((s, l) => s + l.monthly_revenue, 0) / total : 0;
  const avgPayback = (() => {
    const wp = filtered.filter((l) => l.payback_months !== null);
    return wp.length > 0 ? wp.reduce((s, l) => s + l.payback_months!, 0) / wp.length : null;
  })();

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">CRM de Leads</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Leads capturados pelo simulador público
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(["leads", "analytics"] as const).map((tab) => (
            <Button
              key={tab}
              variant={activeTab === tab ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab(tab)}
            >
              {tab === "leads" ? "Leads" : "Análise"}
            </Button>
          ))}
          {manageLeads && (
            <Button
              variant={activeTab === "config" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("config")}
            >
              <Settings className="h-3.5 w-3.5 mr-1.5" />
              Configurações
            </Button>
          )}
        </div>
      </div>

      {/* ══════════════ LEADS TAB ══════════════════════════════════════════════ */}
      {activeTab === "leads" && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card><CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">Total de leads</p>
              <p className="text-3xl font-bold mt-1">{isLoading ? "—" : total}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">Receita/mês média</p>
              <p className="text-3xl font-bold mt-1 text-emerald-600">{isLoading ? "—" : fmtBRL(avgRevenue)}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">Payback médio</p>
              <p className="text-3xl font-bold mt-1 text-blue-600">
                {isLoading ? "—" : avgPayback ? `${avgPayback.toFixed(0)} meses` : "—"}
              </p>
            </CardContent></Card>
          </div>

          {/* Filters */}
          <Card><CardContent className="pt-5">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por nome, e-mail ou cidade..." value={search}
                  onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <select value={filterState} onChange={(e) => setFilterState(e.target.value)}
                className="px-3 py-2 rounded-md border border-input text-sm bg-background">
                <option value="">Todos os estados</option>
                {allStateFilters.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filterSector} onChange={(e) => setFilterSector(e.target.value)}
                className="px-3 py-2 rounded-md border border-input text-sm bg-background">
                <option value="">Todos os setores</option>
                {allSectorFilters.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filterCharger} onChange={(e) => setFilterCharger(e.target.value)}
                className="px-3 py-2 rounded-md border border-input text-sm bg-background">
                <option value="">Todos os carregadores</option>
                {allChargerFilters.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
                <Download className="h-4 w-4" /> Exportar CSV
              </Button>
            </div>
          </CardContent></Card>

          {/* Leads table */}
          <Card><CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                <Zap className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Nenhum lead encontrado</p>
                <p className="text-sm mt-1">Os leads aparecem aqui conforme o formulário público é preenchido.</p>
              </div>
            ) : (
              <div className="divide-y">
                {filtered.map((lead) => (
                  <div key={lead.id} className="px-6 py-4">
                    <div className="flex items-start justify-between cursor-pointer"
                      onClick={() => setExpandedLead(expandedLead === lead.id ? null : lead.id)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="font-semibold">{lead.name}</span>
                          <Badge variant="outline" className="text-xs">
                            <Zap className="h-3 w-3 mr-1" />{lead.charger_type} × {lead.num_chargers}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">{lead.sector}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {lead.city}/{lead.state} · {lead.position}
                          </span>
                          {lead.specialist_message && (
                            <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200">
                              <MessageSquareText className="h-3 w-3 mr-1" />Quer falar com especialista
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-sm flex-wrap">
                          <a href={`mailto:${lead.email}`} className="flex items-center gap-1 text-blue-600 hover:underline"
                            onClick={(e) => e.stopPropagation()}>
                            <Mail className="h-3.5 w-3.5" />{lead.email}
                          </a>
                          <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                            onClick={(e) => e.stopPropagation()}>
                            <Phone className="h-3.5 w-3.5" />{lead.phone}
                          </a>
                          {lead.cnpj && <span className="text-xs text-muted-foreground font-mono">{lead.cnpj}</span>}
                          <span className="text-muted-foreground text-xs">{formatDate(lead.created_at)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 shrink-0 ml-4 text-right">
                        <div><p className="text-xs text-muted-foreground">Receita/mês</p>
                          <p className="font-bold text-emerald-600 text-sm">{fmtBRL(lead.monthly_revenue)}</p></div>
                        <div><p className="text-xs text-muted-foreground">Payback</p>
                          <p className="font-bold text-blue-600 text-sm">
                            {lead.payback_months ? `${lead.payback_months.toFixed(0)} m` : "—"}
                          </p></div>
                        <div><p className="text-xs text-muted-foreground">ROI 5a</p>
                          <p className="font-bold text-sm">{lead.roi_5y_pct.toFixed(0)}%</p></div>
                        {expandedLead === lead.id
                          ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>

                    {expandedLead === lead.id && (
                      <div className="mt-4 pt-4 border-t border-dashed space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                          {[
                            { label: "Receita/mês",       value: fmtBRL(lead.monthly_revenue) },
                            { label: "Payback estimado",  value: lead.payback_months ? `${lead.payback_months.toFixed(0)} meses` : "—" },
                            { label: "ROI 5 anos",        value: `${lead.roi_5y_pct.toFixed(1)}%` },
                            { label: "Pontos de carga",   value: `${lead.num_chargers}× ${lead.charger_type}` },
                          ].map(({ label, value }) => (
                            <div key={label} className="bg-muted/40 rounded-lg p-3">
                              <p className="text-xs text-muted-foreground">{label}</p>
                              <p className="font-semibold mt-0.5">{value}</p>
                            </div>
                          ))}
                        </div>
                        {(lead.message || lead.specialist_message) && (
                          <div className="space-y-2">
                            {lead.message && (
                              <div className="rounded-lg border border-blue-100 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900 p-3">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <MessageSquare className="h-3.5 w-3.5 text-blue-500" />
                                  <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">Mensagem do formulário</p>
                                </div>
                                <p className="text-sm italic">"{lead.message}"</p>
                              </div>
                            )}
                            {lead.specialist_message && (
                              <div className="rounded-lg border border-amber-100 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-3">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <MessageSquareText className="h-3.5 w-3.5 text-amber-500" />
                                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">Mensagem para especialista</p>
                                </div>
                                <p className="text-sm italic">"{lead.specialist_message}"</p>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <a href={`mailto:${lead.email}?subject=Análise de Investimento FinanceDash&body=Olá ${lead.name},`}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors">
                            <Mail className="h-3.5 w-3.5" />Enviar e-mail
                          </a>
                          <a href={`https://wa.me/55${lead.phone.replace(/\D/g, "")}?text=Olá ${encodeURIComponent(lead.name)}, vi sua simulação de investimento!`}
                            target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors">
                            <Phone className="h-3.5 w-3.5" />WhatsApp
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent></Card>
        </>
      )}

      {/* ══════════════ ANALYTICS TAB ══════════════════════════════════════════ */}
      {activeTab === "analytics" && (
        <div className="space-y-6">

          {/* ── Period filter bar ──────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Período:</span>
            </div>
            <div className="flex rounded-lg border border-input overflow-hidden text-sm">
              {([
                { key: "week",    label: "Semanal" },
                { key: "month",   label: "Mensal" },
                { key: "quarter", label: "Trimestral" },
                { key: "custom",  label: "Personalizado" },
              ] as { key: AnalyticsPeriod; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setAnalyticsPeriod(key)}
                  className={`px-3 py-1.5 transition-colors ${
                    analyticsPeriod === key
                      ? "text-white font-medium"
                      : "bg-background hover:bg-muted text-muted-foreground"
                  }`}
                  style={analyticsPeriod === key ? { backgroundColor: DARK } : undefined}
                >
                  {label}
                </button>
              ))}
            </div>
            {analyticsPeriod === "custom" && (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-8 text-sm w-36"
                />
                <span className="text-muted-foreground text-sm">até</span>
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-8 text-sm w-36"
                />
              </div>
            )}
          </div>

          {!analytics || analytics.total === 0 ? (
            <div className="py-24 text-center text-muted-foreground">
              <BarChart2 className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p className="font-medium">Nenhum lead no período selecionado.</p>
              <p className="text-sm mt-1">Ajuste o filtro de período ou aguarde novos leads do formulário público.</p>
            </div>
          ) : (
            <>
              {/* ── KPI strip ────────────────────────────────────────────────── */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  {
                    icon: <Users2 className="h-4 w-4" />,
                    label: "Total de leads",
                    value: analytics.total,
                    sub: `${analytics.thisWeek} nos últimos 7 dias`,
                    color: "text-foreground",
                  },
                  {
                    icon: <Activity className="h-4 w-4" />,
                    label: "Taxa de interesse especialista",
                    value: `${analytics.specialistRate.toFixed(1)}%`,
                    sub: "leads que pediram contato",
                    color: "text-amber-600",
                  },
                  {
                    icon: <TrendingUp className="h-4 w-4" />,
                    label: "Receita mensal potencial",
                    value: fmtBRL(analytics.totalRevenue),
                    sub: `${fmtBRL(analytics.totalRevenue * 12)} ao ano`,
                    color: "text-emerald-600",
                  },
                  {
                    icon: <Zap className="h-4 w-4" />,
                    label: "Pontos de carga demandados",
                    value: analytics.totalPoints,
                    sub: analytics.topState ? `UF líder: ${analytics.topState.uf} (${analytics.topState.count})` : "—",
                    color: "text-blue-600",
                  },
                ].map(({ icon, label, value, sub, color }) => (
                  <Card key={label}>
                    <CardContent className="pt-5">
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        {icon}
                        <p className="text-xs">{label}</p>
                      </div>
                      <p className={`text-2xl font-bold ${color}`}>{value}</p>
                      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* ── Daily trend ──────────────────────────────────────────────── */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">
                    Tendência diária —{" "}
                    {analyticsPeriod === "week"    ? "últimos 7 dias"
                      : analyticsPeriod === "month"   ? "últimos 30 dias"
                      : analyticsPeriod === "quarter"  ? "últimos 90 dias"
                      : "período personalizado"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart data={analytics.trend} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                      <defs>
                        <linearGradient id="leadGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={GREEN} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={GREEN} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 9 }}
                        interval={analyticsPeriod === "week" ? 0 : analyticsPeriod === "quarter" ? 6 : 4}
                        tickFormatter={fmtAxisDate}
                      />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip
                        labelFormatter={(d) => {
                          const [y, m, day] = (d as string).split("-");
                          return `${day}/${m}/${y}`;
                        }}
                        formatter={(v) => [v, "Leads"]}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Area type="monotone" dataKey="leads"
                        stroke={GREEN} strokeWidth={2} fill="url(#leadGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* ── States + Chargers ───────────────────────────────────────── */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* State ranking list */}
                <Card className="lg:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Leads por estado
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {analytics.topStates.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">Sem dados no período</p>
                      ) : analytics.topStates.map((s, i) => {
                        const pct = Math.round((s.count / analytics.maxStateCount) * 100);
                        return (
                          <div key={s.uf} className="flex items-center gap-3 text-sm">
                            <span className="text-muted-foreground text-xs w-4 shrink-0">{i + 1}</span>
                            <div className="w-8 shrink-0">
                              <span className="font-mono font-bold text-xs">{s.uf}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-muted-foreground truncate">
                                {STATE_NAMES[s.uf] ?? s.uf}
                              </div>
                              <div className="mt-1 bg-muted rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${pct}%`, backgroundColor: GREEN }}
                                />
                              </div>
                            </div>
                            <span className="font-semibold text-xs shrink-0 w-6 text-right">{s.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Chargers */}
                <Card className="lg:col-span-3">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      Potências mais desejadas
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={analytics.chargers.length * 38 + 16}>
                      <BarChart
                        data={analytics.chargers}
                        layout="vertical"
                        margin={{ top: 0, right: 40, left: 8, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                        <YAxis type="category" dataKey="type" tick={{ fontSize: 10 }} width={76} />
                        <Tooltip
                          formatter={(v, name) =>
                            name === "count"
                              ? [v, "Leads"]
                              : [v, "Pontos"]
                          }
                          contentStyle={{ fontSize: 12 }}
                        />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]} name="count">
                          {analytics.chargers.map((_, i) => (
                            <Cell key={i} fill={i === 0 ? GREEN : `${GREEN}${Math.round(255 * (1 - i * 0.12)).toString(16).padStart(2, "0")}`} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    {/* Pontos demandados summary */}
                    <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-2">
                      {analytics.chargers.slice(0, 4).map((c) => (
                        <div key={c.type} className="flex items-center justify-between text-xs bg-muted/40 rounded-lg px-3 py-2">
                          <span className="text-muted-foreground truncate mr-2">{c.type}</span>
                          <span className="font-semibold shrink-0">{c.points} pts</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* ── Sectors + Cities ─────────────────────────────────────────── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Sectors */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Users2 className="h-4 w-4" />
                      Nichos com mais simulações
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={analytics.sectors.length * 34 + 16}>
                      <BarChart
                        data={analytics.sectors}
                        layout="vertical"
                        margin={{ top: 0, right: 36, left: 8, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
                        <Tooltip
                          formatter={(v, name) =>
                            name === "count" ? [v, "Leads"] : [v, "Pontos demandados"]
                          }
                          contentStyle={{ fontSize: 12 }}
                        />
                        <Bar dataKey="count" fill={GREEN} radius={[0, 4, 4, 0]} opacity={0.85} name="count" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Cities */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Cidades com maior demanda
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={analytics.cities.length * 34 + 16}>
                      <BarChart
                        data={analytics.cities}
                        layout="vertical"
                        margin={{ top: 0, right: 36, left: 8, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={130} />
                        <Tooltip formatter={(v) => [v, "Leads"]} contentStyle={{ fontSize: 12 }} />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]} name="count">
                          {analytics.cities.map((_, i) => (
                            <Cell key={i} fill={DARK} opacity={1 - i * 0.08} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════ CONFIG TAB ═════════════════════════════════════════════ */}
      {activeTab === "config" && manageLeads && (
        <div className="space-y-6">
          {/* Simulator Config */}
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />Configurações do Simulador
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Parâmetros usados nos cálculos de ROI da landing page pública.
                </p>
              </div>
              {!editingConfig ? (
                <Button size="sm" variant="outline" onClick={startEditingConfig}>Editar</Button>
              ) : (
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => { setEditingConfig(false); setConfigDraft(null); }}>Cancelar</Button>
                  <Button size="sm" onClick={handleSaveConfig} disabled={savingConfig} className="gap-1.5">
                    <Save className="h-3.5 w-3.5" />{savingConfig ? "Salvando…" : "Salvar"}
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Parâmetros globais</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {[
                    { key: "price_per_kwh",       label: "Preço kWh (R$)",           step: 0.01 },
                    { key: "opex_pct",             label: "OPEX (%)",                 step: 0.01,  pct: true },
                    { key: "growth_pct_month",     label: "Crescimento/mês (%)",      step: 0.001, pct: true },
                    { key: "discount_rate_annual", label: "Taxa desconto anual (%)",  step: 0.01,  pct: true },
                    { key: "projection_years",     label: "Anos de projeção",         step: 1 },
                  ].map(({ key, label, step, pct }) => (
                    <div key={key}>
                      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
                      {editingConfig && configDraft ? (
                        <Input type="number" step={step}
                          value={pct
                            ? ((configDraft as any)[key] * 100).toFixed(step === 0.001 ? 1 : 0)
                            : (configDraft as any)[key]}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            setConfigDraft((p) => p ? { ...p, [key]: pct ? v / 100 : v } : p);
                          }}
                          className="h-8 text-sm" />
                      ) : (
                        <p className="text-sm font-semibold py-1">
                          {pct
                            ? `${(((activeConfig as any)?.[key] ?? 0) * 100).toFixed(key === "growth_pct_month" ? 1 : 0)}%`
                            : (activeConfig as any)?.[key] ?? "—"}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Tipos de carregador e CAPEX</p>
                {!activeConfig ? <Skeleton className="h-40 w-full" /> : (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 text-xs text-muted-foreground">
                          <th className="text-left px-4 py-2.5 font-medium">Tipo</th>
                          <th className="text-right px-4 py-2.5 font-medium">CAPEX (R$)</th>
                          <th className="text-right px-4 py-2.5 font-medium">Potência (kW)</th>
                          <th className="text-right px-4 py-2.5 font-medium">Sessões/dia</th>
                          <th className="text-right px-4 py-2.5 font-medium">Duração (min)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {Object.entries(activeConfig.charger_configs).map(([name, cfg]) => (
                          <tr key={name} className="hover:bg-muted/30">
                            <td className="px-4 py-2.5 font-medium">{name}</td>
                            {editingConfig && configDraft ? (
                              (["price_brl", "power_kw", "avg_sessions_day", "avg_duration_min"] as const).map((field) => (
                                <td key={field} className="px-4 py-2 text-right">
                                  <Input type="number" step={field === "power_kw" ? 0.1 : 1}
                                    value={configDraft.charger_configs[name]?.[field] ?? ""}
                                    onChange={(e) => {
                                      const v = parseFloat(e.target.value);
                                      setConfigDraft((p) => p ? {
                                        ...p,
                                        charger_configs: { ...p.charger_configs, [name]: { ...p.charger_configs[name], [field]: v } },
                                      } : p);
                                    }}
                                    className="h-7 text-xs text-right w-24 ml-auto" />
                                </td>
                              ))
                            ) : (
                              <>
                                <td className="px-4 py-2.5 text-right">{fmtBRL(cfg.price_brl)}</td>
                                <td className="px-4 py-2.5 text-right">{cfg.power_kw}</td>
                                <td className="px-4 py-2.5 text-right">{cfg.avg_sessions_day}</td>
                                <td className="px-4 py-2.5 text-right">{cfg.avg_duration_min}</td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Notification Emails */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-4 w-4" />E-mails de Notificação de Leads
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Estes endereços receberão alertas de novos leads. Configure os estados para filtrar por região.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 p-4 rounded-lg border border-dashed">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Adicionar e-mail</p>
                <div className="flex gap-3 flex-wrap">
                  <Input placeholder="nome@empresa.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                    className="flex-1 min-w-48" onKeyDown={(e) => e.key === "Enter" && handleAddEmail()} />
                  <Input placeholder="Nome (opcional)" value={newEmailName} onChange={(e) => setNewEmailName(e.target.value)} className="w-48" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Estados (deixe em branco para receber de todos):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {BR_STATES.map((uf) => (
                      <button key={uf} type="button"
                        onClick={() => setNewEmailStates((prev) =>
                          prev.includes(uf) ? prev.filter((s) => s !== uf) : [...prev, uf])}
                        className={`px-2 py-0.5 rounded text-xs font-mono font-medium border transition-colors ${
                          newEmailStates.includes(uf)
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-background text-muted-foreground border-input hover:border-blue-400"}`}>
                        {uf}
                      </button>
                    ))}
                  </div>
                </div>
                <Button onClick={handleAddEmail} disabled={addingEmail || !newEmail.trim()} className="gap-1.5" size="sm">
                  <Plus className="h-4 w-4" />Adicionar
                </Button>
              </div>

              <Separator />

              {!notifEmails ? <Skeleton className="h-24 w-full" /> :
               notifEmails.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Nenhum e-mail cadastrado.
                </p>
              ) : (
                <div className="space-y-2">
                  {notifEmails.map((e) => {
                    const isExpanded = expandedEmailId === e.id;
                    const currentStates = editingStates[e.id] ?? e.states ?? [];
                    return (
                      <div key={e.id} className="rounded-lg border overflow-hidden">
                        <div className="flex items-center justify-between p-3">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{e.email}</p>
                              {e.name && <p className="text-xs text-muted-foreground">{e.name}</p>}
                            </div>
                            {e.states?.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {e.states.slice(0, 6).map((uf) => (
                                  <span key={uf} className="px-1.5 py-0.5 rounded text-xs font-mono bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">{uf}</span>
                                ))}
                                {e.states.length > 6 && <span className="text-xs text-muted-foreground">+{e.states.length - 6}</span>}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">todos os estados</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
                              onClick={() => isExpanded ? setExpandedEmailId(null) : startEditingEmail(e)}>
                              <Settings className="h-3 w-3" />
                              {isExpanded ? "Fechar" : "Estados"}
                              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            </Button>
                            <Button variant="ghost" size="icon-sm"
                              onClick={() => handleRemoveEmail(e.id)}
                              className="text-destructive hover:text-destructive h-7 w-7">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="border-t bg-muted/30 p-4 space-y-3">
                            <p className="text-xs text-muted-foreground">Selecione os estados. Sem seleção = recebe de todos.</p>
                            <div className="flex flex-wrap gap-1.5">
                              {BR_STATES.map((uf) => (
                                <button key={uf} type="button"
                                  onClick={() => toggleEmailState(e.id, uf)}
                                  className={`px-2 py-0.5 rounded text-xs font-mono font-medium border transition-colors ${
                                    currentStates.includes(uf)
                                      ? "bg-blue-600 text-white border-blue-600"
                                      : "bg-background text-muted-foreground border-input hover:border-blue-400"}`}>
                                  {uf}
                                </button>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => handleSaveEmailStates(e.id)}
                                disabled={savingEmailId === e.id} className="gap-1.5">
                                <Save className="h-3.5 w-3.5" />{savingEmailId === e.id ? "Salvando…" : "Salvar"}
                              </Button>
                              <Button size="sm" variant="ghost"
                                onClick={() => { setExpandedEmailId(null); setEditingStates((p) => { const n = {...p}; delete n[e.id]; return n; }); }}>
                                Cancelar
                              </Button>
                              {currentStates.length > 0 && (
                                <Button size="sm" variant="ghost" className="text-muted-foreground"
                                  onClick={() => setEditingStates((p) => ({ ...p, [e.id]: [] }))}>
                                  Limpar
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
