"use client";

import { PlanGate } from "@/components/PlanGate";
import { useState, useMemo } from "react";
import { GitCompareArrows, Download, Info, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterBar } from "@/components/FilterBar";
import { EmptyState } from "@/components/EmptyState";
import { useFilters } from "@/contexts/FilterContext";
import { useTimeseries, useWeekdays, useRevenueSources, useForecast, useHeatmap } from "@/hooks/useAnalytics";
import { formatCurrency, formatNumber } from "@/lib/format";
import { DownloadableChart } from "@/components/DownloadableChart";
import { exportToCSV } from "@/lib/exportCSV";
import type { FilterParams } from "@/lib/types";
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";

const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function dateLabel(v: string, gran: string): string {
  const d = new Date(v + "T00:00:00");
  if (isNaN(d.getTime())) return v;
  if (gran === "monthly") return `${MONTH_NAMES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
  if (gran === "weekly") return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function dateTooltip(v: string, gran: string): string {
  const d = new Date(v + "T00:00:00");
  if (isNaN(d.getTime())) return v;
  if (gran === "monthly") return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  return d.toLocaleDateString("pt-BR");
}

function addMA<T extends { [key: string]: number | string }>(
  data: T[],
  key: string,
  window: number,
  outKey: string,
): (T & { [k: string]: number })[] {
  return data.map((d, i, arr) => {
    const slice = arr.slice(Math.max(0, i - window + 1), i + 1);
    const ma = slice.reduce((s, x) => s + ((x[key] as number) || 0), 0) / slice.length;
    return { ...d, [outKey]: Math.round(ma * 100) / 100 };
  });
}

function buildComparisonFilters(filters: FilterParams): FilterParams | null {
  if (!filters.date_from || !filters.date_to) return null;
  const from = new Date(filters.date_from + "T00:00:00");
  const to = new Date(filters.date_to + "T00:00:00");
  const durationMs = to.getTime() - from.getTime() + 86400000; // inclusive
  const compTo = new Date(from.getTime() - 86400000);
  const compFrom = new Date(compTo.getTime() - durationMs + 86400000);
  return {
    ...filters,
    date_from: compFrom.toISOString().slice(0, 10),
    date_to: compTo.toISOString().slice(0, 10),
  };
}

function pctChange(curr: number, prev: number | undefined): string {
  if (prev === undefined || prev === 0) return "";
  const delta = ((curr - prev) / Math.abs(prev)) * 100;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;
}

export default function TimeseriesPage() {
  return (
    <PlanGate feature="revenue">
      <TimeseriesPageContent />
    </PlanGate>
  );
}

function TimeseriesPageContent() {
  const { filters } = useFilters();
  const [granularity, setGranularity] = useState<"daily" | "weekly" | "monthly">("daily");
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [forecastHorizon, setForecastHorizon] = useState<30 | 60 | 90>(30);
  const [forecastEnabled, setForecastEnabled] = useState(false);

  const { data: ts, isLoading: tsLoading } = useTimeseries(filters, granularity);
  const { data: forecastData } = useForecast(forecastEnabled ? filters : null, forecastHorizon);
  const { data: weekdays, isLoading: wdLoading } = useWeekdays(filters);
  const { data: heatmapData } = useHeatmap(filters);
  const { data: sources, isLoading: srcLoading } = useRevenueSources(filters);

  const compFilters = useMemo(
    () => (compareEnabled ? buildComparisonFilters(filters) : null),
    [compareEnabled, filters]
  );
  const { data: tsComp } = useTimeseries(compFilters ?? filters, granularity);

  const weekdayData = (weekdays ?? []).map((d: { day: string; sessions: number; revenue: number }) => ({
    ...d, name: d.day,
  }));

  const sourcesWeekly = useMemo(() => {
    const raw: Array<{ date: string; start_fee: number; energy: number; idle: number }> =
      sources?.weekly ?? [];
    const withTotal = raw.map((r) => ({ ...r, total: r.start_fee + r.energy + r.idle }));
    return addMA(withTotal, "total", 4, "ma4");
  }, [sources]);

  // Merge current + comparison by array index
  const mergedTs = useMemo(() => {
    const curr: Array<{ date: string; revenue: number; sessions: number }> = ts ?? [];
    const comp: Array<{ date: string; revenue: number; sessions: number }> = tsComp ?? [];
    return curr.map((d, i) => ({
      ...d,
      prev_revenue: comp[i]?.revenue,
      prev_sessions: comp[i]?.sessions,
      prev_date: comp[i]?.date,
    }));
  }, [ts, tsComp]);

  const hasForecast = forecastEnabled && (forecastData?.forecast?.length ?? 0) > 0;

  // Merge historical + forecast into single array for the combined chart.
  // When granularity is weekly/monthly the daily forecast points are aggregated
  // into buckets so the projection bars align with the historical series.
  const forecastChartData = useMemo(() => {
    const hist = (mergedTs ?? []).map((d) => ({
      ...d,
      forecast_rev: null as number | null,
      fc_upper: null as number | null,
      fc_lower: null as number | null,
    }));
    if (!hasForecast) return hist;

    type FcDay = { date: string; revenue: number; lower: number; upper: number };
    const rawFc = forecastData!.forecast as FcDay[];

    if (granularity === "daily") {
      const fc = rawFc.map((d) => ({
        date: d.date,
        revenue: null as number | null,
        sessions: null as number | null,
        prev_revenue: null as number | null,
        prev_sessions: null as number | null,
        prev_date: null as string | null,
        forecast_rev: d.revenue,
        fc_upper: d.upper,
        fc_lower: d.lower,
      }));
      return [...hist, ...fc];
    }

    // Aggregate daily forecast points into weekly / monthly buckets (sum values)
    const bucket = new Map<string, { sum: number; upper: number; lower: number }>();
    for (const d of rawFc) {
      let key: string;
      if (granularity === "weekly") {
        const dt = new Date(d.date + "T00:00:00");
        const dow = dt.getDay(); // 0 = Sun
        const diff = dt.getDate() - dow + (dow === 0 ? -6 : 1); // back to Monday
        const mon = new Date(dt);
        mon.setDate(diff);
        key = mon.toISOString().slice(0, 10);
      } else {
        key = d.date.slice(0, 7) + "-01"; // monthly: YYYY-MM-01
      }
      const prev = bucket.get(key) ?? { sum: 0, upper: 0, lower: 0 };
      bucket.set(key, { sum: prev.sum + d.revenue, upper: prev.upper + d.upper, lower: prev.lower + d.lower });
    }

    const fc = Array.from(bucket.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, g]) => ({
        date,
        revenue: null as number | null,
        sessions: null as number | null,
        prev_revenue: null as number | null,
        prev_sessions: null as number | null,
        prev_date: null as string | null,
        forecast_rev: g.sum,
        fc_upper: g.upper,
        fc_lower: g.lower,
      }));

    return [...hist, ...fc];
  }, [mergedTs, hasForecast, forecastData, granularity]);

  const granLabel = granularity === "daily" ? "por dia" : granularity === "weekly" ? "por semana" : "por mês";
  const canCompare = Boolean(filters.date_from && filters.date_to);

  function handleCompareClick() {
    if (!canCompare) {
      toast.info("Defina um intervalo de datas nos filtros para comparar períodos.");
      return;
    }
    setCompareEnabled((v) => !v);
  }

  if (!tsLoading && (ts ?? []).length === 0) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Receita & Sessões</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Evolução temporal e padrões de uso</p>
          </div>
          <FilterBar />
        </div>
        <EmptyState
          title="Nenhum dado de receita disponível"
          description="Importe um arquivo Excel para visualizar a evolução de receita, sessões e padrões de uso."
          actionLabel="Importar arquivo"
          actionHref="/dashboard/files"
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Receita & Sessões</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Evolução temporal e padrões de uso</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 border rounded-md overflow-hidden">
            <Button
              variant={forecastEnabled && forecastHorizon === 30 ? "default" : "ghost"}
              size="sm"
              className="h-8 rounded-none text-xs px-2 gap-1"
              onClick={() => { setForecastHorizon(30); setForecastEnabled((v) => forecastHorizon === 30 ? !v : true); }}
            >
              <TrendingUp className="h-3.5 w-3.5" />30d
            </Button>
            <Button
              variant={forecastEnabled && forecastHorizon === 60 ? "default" : "ghost"}
              size="sm"
              className="h-8 rounded-none border-x text-xs px-2"
              onClick={() => { setForecastHorizon(60); setForecastEnabled((v) => forecastHorizon === 60 ? !v : true); }}
            >60d</Button>
            <Button
              variant={forecastEnabled && forecastHorizon === 90 ? "default" : "ghost"}
              size="sm"
              className="h-8 rounded-none text-xs px-2"
              onClick={() => { setForecastHorizon(90); setForecastEnabled((v) => forecastHorizon === 90 ? !v : true); }}
            >90d</Button>
          </div>
          <Button
            variant={compareEnabled ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={handleCompareClick}
            title={canCompare ? "Comparar com período anterior" : "Defina um intervalo de datas nos filtros para comparar"}
          >
            <GitCompareArrows className="h-3.5 w-3.5" />
            Comparar
            {!canCompare && <Info className="h-3 w-3 opacity-50" />}
          </Button>
          <Tabs value={granularity} onValueChange={(v) => setGranularity(v as typeof granularity)}>
            <TabsList className="h-8">
              <TabsTrigger value="daily" className="text-xs px-3">Diário</TabsTrigger>
              <TabsTrigger value="weekly" className="text-xs px-3">Semanal</TabsTrigger>
              <TabsTrigger value="monthly" className="text-xs px-3">Mensal</TabsTrigger>
            </TabsList>
          </Tabs>
          <FilterBar />
        </div>
      </div>

      {/* Revenue + Sessions combined */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Receita × Sessões ({granLabel})
              {compareEnabled && compFilters && (
                <span className="text-xs font-normal text-muted-foreground ml-2">
                  comparando com {compFilters.date_from} → {compFilters.date_to}
                </span>
              )}
              {forecastEnabled && forecastData && !hasForecast && (
                <span className="text-xs font-normal text-amber-600 dark:text-amber-400 ml-2">
                  (dados insuficientes para projeção — mínimo 7 dias)
                </span>
              )}
            </CardTitle>
            {(ts ?? []).length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => exportToCSV(
                  mergedTs.map((d) => ({
                    data: d.date,
                    receita: d.revenue,
                    sessoes: d.sessions,
                    ...(compareEnabled ? {
                      data_comparacao: d.prev_date ?? "",
                      receita_periodo_anterior: d.prev_revenue ?? "",
                      sessoes_periodo_anterior: d.prev_sessions ?? "",
                    } : {}),
                  })),
                  `receita-sessoes-${granularity}`
                )}
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {tsLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <DownloadableChart filename={`receita-sessoes-${granularity}`}>
            <ResponsiveContainer width="100%" height={288}>
              <ComposedChart data={forecastChartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => dateLabel(v, granularity)}
                  interval="preserveStartEnd"
                />
                <YAxis yAxisId="rev" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `R$${v}`} width={64} />
                <YAxis yAxisId="ses" orientation="right" tick={{ fontSize: 11 }} width={36} />
                <Tooltip
                  formatter={(v: number, name: string, props: { payload?: { prev_revenue?: number; prev_sessions?: number; prev_date?: string } }) => {
                    const p = props.payload;
                    if (name === "revenue") {
                      const change = compareEnabled ? pctChange(v, p?.prev_revenue) : "";
                      return [formatCurrency(v) + (change ? ` (${change})` : ""), "Receita"];
                    }
                    if (name === "sessions") {
                      const change = compareEnabled ? pctChange(v, p?.prev_sessions) : "";
                      return [formatNumber(v) + (change ? ` (${change})` : ""), "Sessões"];
                    }
                    if (name === "prev_revenue") return [formatCurrency(v), "Receita anterior"];
                    if (name === "prev_sessions") return [formatNumber(v), "Sessões anteriores"];
                    if (name === "forecast_rev") return [formatCurrency(v), `Previsão (${forecastHorizon}d)`];
                    if (name === "fc_upper") return [formatCurrency(v), "IC 95% (máx.)"];
                    if (name === "fc_lower") return [formatCurrency(v), "IC 95% (mín.)"];
                    return [v, name];
                  }}
                  labelFormatter={(l) => dateTooltip(l, granularity)}
                />
                <Legend formatter={(v: string) => ({
                  revenue: "Receita", sessions: "Sessões",
                  prev_revenue: "Receita anterior", prev_sessions: "Sessões anteriores",
                  forecast_rev: `Previsão (${forecastHorizon}d)`,
                }[v] ?? v)} />
                <Bar yAxisId="rev" dataKey="revenue" fill="#2563eb" opacity={0.85} radius={[2, 2, 0, 0]} />
                {compareEnabled && (
                  <Bar yAxisId="rev" dataKey="prev_revenue" fill="#93c5fd" opacity={0.6} radius={[2, 2, 0, 0]} />
                )}
                <Line yAxisId="ses" type="monotone" dataKey="sessions" stroke="#f59e0b" strokeWidth={2} dot={false} />
                {compareEnabled && (
                  <Line yAxisId="ses" type="monotone" dataKey="prev_sessions" stroke="#fde68a" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                )}
                <Line yAxisId="rev" type="monotone" dataKey="fc_upper" stroke="#818cf8" strokeWidth={1} strokeOpacity={0.5} strokeDasharray="3 3" dot={false} legendType="none" hide={!hasForecast} connectNulls={false} />
                <Line yAxisId="rev" type="monotone" dataKey="fc_lower" stroke="#818cf8" strokeWidth={1} strokeOpacity={0.5} strokeDasharray="3 3" dot={false} legendType="none" hide={!hasForecast} connectNulls={false} />
                <Line yAxisId="rev" type="monotone" dataKey="forecast_rev" stroke="#818cf8" strokeWidth={2} strokeDasharray="6 3" dot={false} hide={!hasForecast} connectNulls={false} />
                {hasForecast && forecastData?.r2 != null && (
                  <ReferenceLine yAxisId="rev" y={0} label={{ value: `R²=${forecastData.r2}`, position: "insideBottomRight", fontSize: 10, fill: "#818cf8" }} stroke="none" />
                )}
              </ComposedChart>
            </ResponsiveContainer>
            </DownloadableChart>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Weekday pattern */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Padrão por Dia da Semana</CardTitle>
          </CardHeader>
          <CardContent>
            {wdLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : (
              <DownloadableChart filename="padrao-dia-semana">
              <ResponsiveContainer width="100%" height={208}>
                <ComposedChart data={weekdayData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="ses" tick={{ fontSize: 11 }} width={36} />
                  <YAxis yAxisId="rev" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `R$${v}`} width={64} />
                  <Tooltip
                    formatter={(v: number, name: string) =>
                      name === "revenue" ? [formatCurrency(v), "Receita"] : [formatNumber(v), "Sessões"]
                    }
                  />
                  <Legend formatter={(v: string) => (v === "revenue" ? "Receita" : "Sessões")} />
                  <Bar yAxisId="ses" dataKey="sessions" radius={[3, 3, 0, 0]}>
                    {weekdayData.map((_entry: unknown, i: number) => (
                      <Cell key={i} fill={i >= 5 ? "#f59e0b" : "#2563eb"} />
                    ))}
                  </Bar>
                  <Line yAxisId="rev" type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
              </DownloadableChart>
            )}
          </CardContent>
        </Card>

        {/* Revenue sources stacked + 4-week MA */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Fontes de Receita (semanal)</CardTitle>
          </CardHeader>
          <CardContent>
            {srcLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : (
              <DownloadableChart filename="fontes-receita-semanal">
              <ResponsiveContainer width="100%" height={208}>
                <ComposedChart data={sourcesWeekly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: string) => dateLabel(v, "weekly")}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `R$${v}`} width={64} />
                  <Tooltip
                    formatter={(v: number, name: string) => {
                      const labels: Record<string, string> = {
                        energy: "Energia", start_fee: "Taxa Início", idle: "Ociosidade", ma4: "MM 4 semanas",
                      };
                      return [formatCurrency(v), labels[name] ?? name];
                    }}
                    labelFormatter={(l: string) => dateTooltip(l, "weekly")}
                  />
                  <Legend formatter={(v: string) => ({
                    energy: "Energia", start_fee: "Taxa Início", idle: "Ociosidade", ma4: "MM 4 sem",
                  }[v] ?? v)} />
                  <Bar dataKey="energy" stackId="a" fill="#2563eb" name="energy" />
                  <Bar dataKey="start_fee" stackId="a" fill="#10b981" name="start_fee" />
                  <Bar dataKey="idle" stackId="a" fill="#f59e0b" name="idle" radius={[2, 2, 0, 0]} />
                  <Line type="monotone" dataKey="ma4" stroke="#ef4444" strokeWidth={2} dot={false} strokeDasharray="5 3" name="ma4" />
                </ComposedChart>
              </ResponsiveContainer>
              </DownloadableChart>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Heatmap dia × hora */}
      <HeatmapCard data={heatmapData ?? []} />
    </div>
  );
}

const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function HeatmapCard({ data }: { data: Array<{ weekday: number; hour: number; sessions: number }> }) {
  if (data.length === 0) return null;

  const maxSessions = Math.max(...data.map((d) => d.sessions), 1);
  const lookup = new Map(data.map((d) => [`${d.weekday}-${d.hour}`, d.sessions]));

  const cellColor = (sessions: number): string => {
    if (sessions === 0) return "bg-slate-100 dark:bg-slate-800";
    const intensity = sessions / maxSessions;
    if (intensity < 0.2) return "bg-blue-100 dark:bg-blue-950";
    if (intensity < 0.4) return "bg-blue-200 dark:bg-blue-900";
    if (intensity < 0.6) return "bg-blue-400 dark:bg-blue-700";
    if (intensity < 0.8) return "bg-blue-600 dark:bg-blue-500";
    return "bg-blue-800 dark:bg-blue-400";
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Heatmap — Sessões por Dia da Semana × Hora</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            {/* Hour headers */}
            <div className="flex mb-1">
              <div className="w-10 shrink-0" />
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="flex-1 text-center text-[0.6rem] text-muted-foreground">
                  {h % 3 === 0 ? `${h}h` : ""}
                </div>
              ))}
            </div>
            {/* Rows */}
            {WEEKDAY_LABELS.map((label, wd) => (
              <div key={wd} className="flex items-center mb-0.5">
                <div className="w-10 shrink-0 text-[0.65rem] text-muted-foreground text-right pr-1.5">{label}</div>
                {Array.from({ length: 24 }, (_, h) => {
                  const sessions = lookup.get(`${wd}-${h}`) ?? 0;
                  return (
                    <div
                      key={h}
                      className={`flex-1 aspect-square rounded-[2px] mx-px transition-colors ${cellColor(sessions)}`}
                      title={`${label} ${h}h — ${sessions} sessões`}
                    />
                  );
                })}
              </div>
            ))}
            {/* Legend */}
            <div className="flex items-center gap-1.5 mt-2 text-[0.65rem] text-muted-foreground">
              <span>Menos</span>
              {["bg-slate-100 dark:bg-slate-800", "bg-blue-100 dark:bg-blue-950", "bg-blue-200 dark:bg-blue-900", "bg-blue-400 dark:bg-blue-700", "bg-blue-600 dark:bg-blue-500", "bg-blue-800 dark:bg-blue-400"].map((cls, i) => (
                <div key={i} className={`w-3 h-3 rounded-sm ${cls}`} />
              ))}
              <span>Mais</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
