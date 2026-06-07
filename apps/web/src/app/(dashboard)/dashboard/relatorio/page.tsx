"use client";

import { useRef, useState } from "react";
import { Printer, Download, BarChart2, TrendingUp, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FilterBar } from "@/components/FilterBar";
import { useFilters } from "@/contexts/FilterContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  useKPIs, useTimeseries, useHourly, useDRE, useStations,
  useWeekdays, useInsights, usePayments,
} from "@/hooks/useAnalytics";
import { formatCurrency, formatNumber, formatPct, formatKwh } from "@/lib/format";
import { downloadChartAsPNG } from "@/lib/downloadChart";
import {
  ComposedChart, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Line,
} from "recharts";

const PIE_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function dateLabel(v: string): string {
  const d = new Date(v + "T00:00:00");
  if (isNaN(d.getTime())) return v;
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function ReportSection({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`mb-8 break-inside-avoid ${className ?? ""}`}>
      <h2 className="text-sm font-bold uppercase tracking-wide text-blue-700 border-b border-blue-100 pb-1.5 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function KPIBox({ label, value, sub, color = "blue" }: { label: string; value: string; sub?: string; color?: string }) {
  const borderColors: Record<string, string> = {
    blue: "border-l-blue-500", emerald: "border-l-emerald-500",
    amber: "border-l-amber-500", red: "border-l-red-500", violet: "border-l-violet-500",
  };
  const textColors: Record<string, string> = {
    blue: "text-blue-700", emerald: "text-emerald-700",
    amber: "text-amber-700", red: "text-red-700", violet: "text-violet-700",
  };
  return (
    <div className={`border-l-4 ${borderColors[color] ?? "border-l-blue-500"} pl-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-r`}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${textColors[color] ?? "text-blue-700"}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function RelatorioPage() {
  const { filters } = useFilters();
  const { user } = useAuth();
  const { data: kpis, isLoading: kpisLoading } = useKPIs(filters);
  const { data: timeseries, isLoading: tsLoading } = useTimeseries(filters);
  const { data: hourly } = useHourly(filters);
  const { data: dre, isLoading: dreLoading } = useDRE(filters, "monthly");
  const { data: stations } = useStations(filters, 10);
  const { data: weekdays } = useWeekdays(filters);
  const { data: insights } = useInsights(filters);
  const { data: payments } = usePayments(filters);

  const ranking = stations?.ranking?.slice(0, 10) ?? [];
  const dreRows = dre ?? [];
  const weekdayData = (weekdays ?? []).map((d: { day: string; sessions: number; revenue: number }) => ({ ...d, name: d.day }));
  const METHOD_LABELS: Record<string, string> = {
    PAGBANK_CARD: "PagBank Cartão", PAGBANK_PIX: "PagBank Pix", pagbank_pix: "PagBank Pix",
    WALLET: "Wallet", VOUCHER: "Voucher", MANUAL: "Manual", PIX: "Pix",
  };
  const methods = (payments?.methods ?? []).map((m: { method: string; sessions: number; revenue: number }) => ({
    ...m,
    name: METHOD_LABELS[m.method] ?? m.method,
  }));
  const insightList = (insights ?? []) as Array<{ severity: string; title: string; body: string }>;

  // Timeseries with 7-day MA
  const timeseriesWithMA = (timeseries ?? []).map((d: { revenue: number }, i: number, arr: { revenue: number }[]) => {
    const window = arr.slice(Math.max(0, i - 6), i + 1);
    const ma = window.reduce((s: number, x) => s + x.revenue, 0) / window.length;
    return { ...(d as object), ma7: Math.round(ma * 100) / 100 };
  });

  const today = new Date().toLocaleDateString("pt-BR");

  // Temporarily strip the `.dark` class so reports always print/export in light mode
  const withLightMode = async (fn: () => void | Promise<void>) => {
    const html = document.documentElement;
    const wasDark = html.classList.contains("dark");
    if (wasDark) html.classList.remove("dark");
    try {
      await fn();
    } finally {
      if (wasDark) html.classList.add("dark");
    }
  };

  const handlePrint = () => {
    const html = document.documentElement;
    const wasDark = html.classList.contains("dark");
    if (wasDark) html.classList.remove("dark");
    const restore = () => {
      if (wasDark) html.classList.add("dark");
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  };

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #report-content, #report-content * { visibility: visible; }
          #report-content {
            position: absolute; top: 0; left: 0; width: 100%;
            padding: 0; border: none !important;
            box-shadow: none !important; border-radius: 0 !important;
          }
          .no-print { display: none !important; }
          @page { margin: 15mm; }
        }
      `}</style>

      <div className="p-6 space-y-4">
        {/* Controls — hidden in print */}
        <div className="flex items-center justify-between no-print">
          <div>
            <h1 className="text-2xl font-bold">Relatório Financeiro</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Relatório executivo completo para impressão ou exportação PDF</p>
          </div>
          <div className="flex items-center gap-2">
            <FilterBar />
            <Button onClick={handlePrint} className="gap-2">
              <Printer className="h-4 w-4" />
              Imprimir / Salvar PDF
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground no-print bg-blue-50 dark:bg-blue-950 border border-blue-200 rounded p-2">
          <strong>Dica:</strong> Clique em "Imprimir / Salvar PDF". No diálogo de impressão, selecione <strong>Salvar como PDF</strong> como destino.
          Para melhor qualidade, defina margens como <em>Mínimas</em> e ative <em>Gráficos de fundo</em>.
        </p>

        {/* Report */}
        <div id="report-content" className="bg-white dark:bg-slate-900 p-8">

          {/* Cover / header */}
          <div className="flex items-start justify-between mb-6 pb-5 border-b-2 border-green-600">
            <div>
              {/* Logo Intelbras */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/intelbras-logo.svg" alt="Intelbras" style={{ display: "block", marginBottom: "10px", width: "58mm", height: "auto" }} />
              <h1 className="text-2xl font-bold">Relatório Financeiro Executivo</h1>
              <p className="text-sm font-medium mt-0.5" style={{ color: "#029d39" }}>
                Intelbras Finance — Gestão Financeira para Eletropostos
              </p>
              <p className="text-muted-foreground text-sm mt-1">
                {filters.date_from && filters.date_to
                  ? `Período: ${new Date(filters.date_from).toLocaleDateString("pt-BR")} a ${new Date(filters.date_to).toLocaleDateString("pt-BR")}`
                  : `Base: ${kpis?.days ?? "—"} dias de dados`}
              </p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p className="font-medium text-sm text-foreground">Emitido em {today}</p>
              {user?.name && <p className="mt-1">Gerado por: <span className="font-medium text-foreground">{user.name}</span></p>}
              {user?.organization_name && <p className="mt-0.5">Organização: <span className="font-medium text-foreground">{user.organization_name}</span></p>}
              <p className="mt-1">Documento confidencial · Uso interno</p>
            </div>
          </div>

          {/* Section 1: Primary KPIs */}
          <ReportSection title="1. Indicadores Primários de Desempenho">
            {kpisLoading ? <Skeleton className="h-28" /> : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <KPIBox label="Receita Confirmada" value={formatCurrency(kpis?.revenue ?? 0)} sub={`${formatNumber(kpis?.paid_sessions ?? 0)} sessões pagas`} color="blue" />
                <KPIBox label="Energia Entregue" value={formatKwh(kpis?.energy_kwh ?? 0)} sub={`R$ ${(kpis?.rev_per_kwh ?? 0).toFixed(2)}/kWh`} color="emerald" />
                <KPIBox label="Ticket Médio" value={formatCurrency(kpis?.avg_ticket ?? 0)} sub={`${formatNumber(kpis?.sessions_per_day ?? 0, 1)} sess/dia`} color="violet" />
                <KPIBox label="Projeção Anual" value={formatCurrency(kpis?.proj_annual ?? 0)} sub={`base ${kpis?.days ?? 0} dias`} color="amber" />
              </div>
            )}
            {kpisLoading ? null : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPIBox label="Taxa de Conversão" value={formatPct(kpis?.conversion ?? 0)} color="emerald" />
                <KPIBox label="Usuários Únicos" value={formatNumber(kpis?.unique_users ?? 0)} sub={`${kpis?.power_users ?? 0} power users`} color="blue" />
                <KPIBox label="Receita / Dia" value={formatCurrency(kpis?.rev_per_day ?? 0)} color="blue" />
                <KPIBox label="Taxa de Reprovação" value={formatPct(kpis?.rejection_rate ?? 0)} sub={`${kpis?.rejected_sessions ?? 0} pagamentos`} color="red" />
              </div>
            )}
          </ReportSection>

          {/* Section 2: Revenue chart */}
          <ReportSection title="2. Evolução da Receita Diária">
            {tsLoading ? <Skeleton className="h-52" /> : (
              <div id="chart-receita" className="relative group">
              <button
                className="no-print absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 dark:bg-slate-800/90 hover:bg-white dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded p-1 shadow-sm"
                title="Baixar gráfico — PNG 300 DPI"
                type="button"
                onClick={() => withLightMode(() => { const el = document.getElementById("chart-receita"); if (el) return downloadChartAsPNG(el, "relatorio-receita-diaria"); })}
              >
                <Download className="h-3 w-3 text-slate-600 dark:text-slate-300" />
              </button>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={timeseriesWithMA} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={dateLabel} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `R$${v.toLocaleString("pt-BR")}`} width={72} domain={["auto", "auto"]} />
                  <Tooltip
                    formatter={(v: number, name: string) => [formatCurrency(v), name === "ma7" ? "MM 7 dias" : "Receita"]}
                    labelFormatter={(l: string) => new Date(l + "T00:00:00").toLocaleDateString("pt-BR")}
                  />
                  <Legend formatter={(v: string) => v === "ma7" ? "MM 7 dias" : "Receita diária"} />
                  <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={1.5} fill="url(#rGrad)" name="revenue" />
                  <Line type="monotone" dataKey="ma7" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="4 2" name="ma7" />
                </ComposedChart>
              </ResponsiveContainer>
              </div>
            )}
          </ReportSection>

          {/* Section 3: Hourly + Weekday patterns side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <ReportSection title="3a. Distribuição Horária">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={hourly ?? []} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="hour" tick={{ fontSize: 9 }} tickFormatter={(v: number) => `${v}h`} interval={2} />
                  <YAxis tick={{ fontSize: 9 }} width={28} />
                  <Tooltip formatter={(v: number) => [formatNumber(v), "Sessões"]} labelFormatter={(l: number) => `${l}:00`} />
                  <Bar dataKey="sessions" fill="#2563eb" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ReportSection>

            <ReportSection title="3b. Receita por Dia da Semana">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={weekdayData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} tickFormatter={(v: number) => `R$${v}`} width={52} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), "Receita"]} />
                  <Bar dataKey="revenue" radius={[2, 2, 0, 0]}>
                    {weekdayData.map((_: unknown, i: number) => (
                      <Cell key={i} fill={i >= 5 ? "#f59e0b" : "#2563eb"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ReportSection>
          </div>

          {/* Section 4: Meios de pagamento + Top estações */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {methods.length > 0 && (
              <ReportSection title="4a. Meios de Pagamento">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart margin={{ top: 24, right: 24, bottom: 24, left: 24 }}>
                    <Pie data={methods} dataKey="sessions" nameKey="name" cx="50%" cy="50%" innerRadius={36} outerRadius={62} paddingAngle={2}
                      label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={true}>
                      {methods.map((_: unknown, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [formatNumber(v) + " sessões"]} />
                  </PieChart>
                </ResponsiveContainer>
              </ReportSection>
            )}

            {ranking.length > 0 && (
              <ReportSection title="4b. Top Estações — Receita">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-1 font-medium">#</th>
                      <th className="text-left py-1 font-medium">Estação</th>
                      <th className="text-right py-1 font-medium">Receita</th>
                      <th className="text-right py-1 font-medium">Sess/dia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((r: { station: string; revenue: number; sessions_per_day: number }, i: number) => (
                      <tr key={i} className="border-b">
                        <td className="py-1 text-muted-foreground">{i + 1}</td>
                        <td className="py-1 truncate max-w-[120px]">{r.station}</td>
                        <td className="text-right py-1 tabular-nums">{formatCurrency(r.revenue)}</td>
                        <td className="text-right py-1 tabular-nums">{formatNumber(r.sessions_per_day, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ReportSection>
            )}
          </div>

          {/* Section 5: DRE resumida */}
          {dreRows.length > 0 && (
            <ReportSection title="5. DRE — Demonstrativo de Resultado (Mensal)">
              {dreLoading ? <Skeleton className="h-32" /> : (
                <>
                  <div id="chart-dre" className="relative group">
                  <button
                    className="no-print absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 dark:bg-slate-800/90 hover:bg-white dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded p-1 shadow-sm"
                    title="Baixar gráfico — PNG 300 DPI"
                    type="button"
                    onClick={() => withLightMode(() => { const el = document.getElementById("chart-dre"); if (el) return downloadChartAsPNG(el, "relatorio-dre"); })}
                  >
                    <Download className="h-3 w-3 text-slate-600 dark:text-slate-300" />
                  </button>
                  <ResponsiveContainer width="100%" height={180}>
                    <ComposedChart data={dreRows} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                      <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `R$${v.toLocaleString("pt-BR")}`} width={72} />
                      <Tooltip formatter={(v: number, name: string) => [formatCurrency(v), name === "net_revenue" ? "Receita" : name === "ebitda" ? "EBITDA" : "Lucro"]} />
                      <Legend formatter={(v: string) => ({ net_revenue: "Receita Líq.", ebitda: "EBITDA", ebit: "Lucro" }[v] ?? v)} />
                      <Bar dataKey="net_revenue" fill="#2563eb" opacity={0.7} radius={[2, 2, 0, 0]} name="net_revenue" />
                      <Line type="monotone" dataKey="ebitda" stroke="#10b981" strokeWidth={2} dot={false} name="ebitda" />
                      <Line type="monotone" dataKey="ebit" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="4 2" name="ebit" />
                    </ComposedChart>
                  </ResponsiveContainer>
                  </div>
                  <div className="overflow-x-auto mt-3">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left py-1 font-medium">Período</th>
                          <th className="text-right py-1 font-medium">Receita Líq.</th>
                          <th className="text-right py-1 font-medium">Custos</th>
                          <th className="text-right py-1 font-medium">EBITDA</th>
                          <th className="text-right py-1 font-medium">Mg EBITDA</th>
                          <th className="text-right py-1 font-medium">Lucro Líq.</th>
                          <th className="text-right py-1 font-medium">Sessões</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dreRows.map((r: { period: string; net_revenue: number; total_costs: number; ebitda: number; ebitda_margin_pct: number; ebit: number; sessions: number }) => (
                          <tr key={r.period} className="border-b">
                            <td className="py-1 font-medium">{r.period}</td>
                            <td className="text-right py-1 tabular-nums">{formatCurrency(r.net_revenue)}</td>
                            <td className="text-right py-1 tabular-nums text-red-600">{formatCurrency(r.total_costs)}</td>
                            <td className="text-right py-1 tabular-nums">{formatCurrency(r.ebitda)}</td>
                            <td className="text-right py-1">
                              <Badge variant={r.ebitda_margin_pct >= 0 ? "default" : "destructive"} className="text-[9px] py-0">
                                {formatPct(r.ebitda_margin_pct)}
                              </Badge>
                            </td>
                            <td className={`text-right py-1 tabular-nums font-semibold ${r.ebit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                              {formatCurrency(r.ebit)}
                            </td>
                            <td className="text-right py-1 tabular-nums text-muted-foreground">{formatNumber(r.sessions)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </ReportSection>
          )}

          {/* Section 6: Operational KPIs */}
          <ReportSection title="6. Indicadores Operacionais Complementares">
            {kpisLoading ? <Skeleton className="h-20" /> : (
              <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                <KPIBox label="kWh / Dia" value={`${formatNumber(kpis?.kwh_per_day ?? 0, 1)} kWh`} color="emerald" />
                <KPIBox label="kWh médio/sessão" value={`${formatNumber(kpis?.avg_kwh ?? 0, 1)} kWh`} color="emerald" />
                <KPIBox label="Power Users" value={formatNumber(kpis?.power_users ?? 0)} sub={`${formatPct(kpis?.power_rev_pct ?? 0)} da receita`} color="violet" />
                <KPIBox label="Usuários 1x" value={formatNumber(kpis?.one_time ?? 0)} color="amber" />
                <KPIBox label="Receita Pendente" value={formatCurrency(kpis?.pending_rev ?? 0)} color="red" />
                <KPIBox label="Receita Ociosidade" value={formatCurrency(kpis?.idle_rev ?? 0)} sub={`${kpis?.idle_sessions ?? 0} sess.`} color="amber" />
                <KPIBox label="Aprovação Total" value={formatPct(kpis?.approval ?? 0)} color="emerald" />
                <KPIBox label="Total Sessões" value={formatNumber(kpis?.total_sessions ?? 0)} sub={`${kpis?.days ?? 0} dias`} color="blue" />
              </div>
            )}
          </ReportSection>

          {/* Section 7: Insights */}
          {insightList.length > 0 && (
            <ReportSection title="7. Insights & Oportunidades Detectadas">
              <div className="space-y-2">
                {insightList.slice(0, 8).map((ins, i) => (
                  <div key={i} className={`flex gap-2 p-2 rounded text-xs ${
                    ins.severity === "warning" ? "bg-amber-50 border border-amber-200 dark:bg-amber-950"
                    : ins.severity === "success" ? "bg-emerald-50 border border-emerald-200 dark:bg-emerald-950"
                    : "bg-blue-50 border border-blue-200 dark:bg-blue-950"
                  }`}>
                    <Badge variant="outline" className={`text-[9px] shrink-0 h-fit ${
                      ins.severity === "warning" ? "border-amber-400 text-amber-700"
                      : ins.severity === "success" ? "border-emerald-400 text-emerald-700"
                      : "border-blue-400 text-blue-700"
                    }`}>
                      {ins.severity === "warning" ? "Atenção" : ins.severity === "success" ? "Positivo" : "Info"}
                    </Badge>
                    <div>
                      <p className="font-semibold">{ins.title}</p>
                      <p className="text-muted-foreground">{ins.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ReportSection>
          )}

          {/* Footer */}
          <div className="border-t-2 border-slate-200 pt-4 mt-4 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Intelbras Finance — Gestão Financeira para Eletropostos</span>
            <span>
              Emitido em {today}
              {user?.name ? ` · ${user.name}` : ""}
              {user?.organization_name ? ` · ${user.organization_name}` : ""}
              {" · "}Documento confidencial — uso interno
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
