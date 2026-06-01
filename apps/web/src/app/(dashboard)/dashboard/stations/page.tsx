"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FilterBar } from "@/components/FilterBar";
import { EmptyState } from "@/components/EmptyState";
import { useFilters } from "@/contexts/FilterContext";
import { useKPIs, useStations, useConnectors, useUsers, useSessionDuration, useStationChurn } from "@/hooks/useAnalytics";
import { formatCurrency, formatNumber, formatPct } from "@/lib/format";
import { DownloadableChart } from "@/components/DownloadableChart";
import { StationDetailDrawer } from "@/components/StationDetailDrawer";
import { exportToCSV } from "@/lib/exportCSV";
import { Download, TrendingDown } from "lucide-react";
import api from "@/lib/api";
import useSWR from "swr";
import { useMemo, useState } from "react";

const fetcher = (url: string) => api.get(url).then((r) => r.data);
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, Legend, ComposedChart, Line,
} from "recharts";

const COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316"];

export default function StationsPage() {
  const { filters } = useFilters();
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const { data: kpis } = useKPIs(filters);
  const { data: org } = useSWR<{ settings?: { operating_hours?: number; operating_hours_start?: number; operating_hours_end?: number } }>("/org", fetcher);
  const operatingHours = (() => {
    const s = org?.settings;
    if (!s) return 24;
    if (s.operating_hours_start !== undefined && s.operating_hours_end !== undefined) {
      const hours = (s.operating_hours_end - s.operating_hours_start) / 60;
      return Math.max(0.5, Math.min(24, hours));
    }
    return s.operating_hours ?? 24;
  })();
  const { data: stations, isLoading: stnLoading } = useStations(filters, 15, operatingHours);
  const { data: connectors, isLoading: connLoading } = useConnectors(filters);
  const { data: users, isLoading: usersLoading } = useUsers(filters);
  const { data: sessionDur, isLoading: durLoading } = useSessionDuration(filters);
  const { data: churnData } = useStationChurn(filters);

  const ranking: Array<{ station: string; revenue: number; sessions: number; kwh: number }> =
    stations?.ranking ?? [];
  const occupancy: Array<{ station: string; occupancy_pct: number }> =
    stations?.occupancy ?? [];

  const days = kpis?.days || 1;

  const top15Rev = ranking.slice(0, 15);
  const top15Sess = [...ranking]
    .map(r => ({ ...r, sessions_per_day: r.sessions / days }))
    .sort((a, b) => b.sessions_per_day - a.sessions_per_day)
    .slice(0, 15);

  const connectorData: Array<{ connector_type: string; sessions: number; revenue: number }> =
    connectors ?? [];
  const userSegments: Array<{ label: string; users: number; revenue: number }> =
    users?.segments ?? [];

  const occColor = (v: number) => (v >= 80 ? "#10b981" : v >= 50 ? "#2563eb" : "#ef4444");

  interface DurBucket { label: string; sessions: number; avg_ticket: number; avg_kwh: number }
  const durBuckets: DurBucket[] = sessionDur?.buckets ?? [];
  const avgDuration: number = sessionDur?.avg_duration ?? 0;
  const medianDuration: number = sessionDur?.median_duration ?? 0;

  const connectorColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    connectorData.forEach((d, i) => { map[d.connector_type] = COLORS[i % COLORS.length]; });
    return map;
  }, [connectorData]);

  const hasData = !stnLoading && ranking.length > 0;

  if (!stnLoading && !hasData) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Estações & Conectores</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Desempenho por estação, conector e perfil de usuário</p>
          </div>
          <FilterBar />
        </div>
        <EmptyState
          title="Nenhum dado de estação disponível"
          description="Importe um arquivo Excel para visualizar o desempenho por estação e conector."
          actionLabel="Importar arquivo"
          actionHref="/dashboard/files"
        />
      </div>
    );
  }

  return (
    <>
    <StationDetailDrawer
      stationName={selectedStation}
      filters={filters}
      onClose={() => setSelectedStation(null)}
    />
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Estações & Conectores</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Clique em uma estação para ver detalhes</p>
        </div>
        <FilterBar />
      </div>

      {/* Churn alert */}
      {Array.isArray(churnData) && churnData.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {`${churnData.length} ${churnData.length === 1 ? "estação" : "estações"} com queda >30% de sessões MoM`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {churnData.map((s: { station: string; prev_sessions: number; curr_sessions: number; change_pct: number }) => (
              <button
                key={s.station}
                onClick={() => setSelectedStation(s.station)}
                className="flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 px-2.5 py-1 text-xs font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors"
              >
                <span>{s.station}</span>
                <span className="text-amber-600 dark:text-amber-400 font-semibold">{s.change_pct.toFixed(0)}%</span>
              </button>
            ))}
          </div>
          {churnData[0] && (
            <p className="text-[0.7rem] text-amber-600 dark:text-amber-500 mt-2">
              Comparação: {churnData[0].prev_month} → {churnData[0].curr_month}. Clique numa estação para ver detalhes.
            </p>
          )}
        </div>
      )}

      {/* Top 15 por Receita */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Top 15 Estações por Receita</CardTitle>
            {ranking.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => exportToCSV(
                  ranking.map((r, i) => ({
                    rank: i + 1,
                    estacao: r.station,
                    receita: r.revenue,
                    sessoes: r.sessions,
                    kwh: r.kwh,
                    sessoes_por_dia: Number((r.sessions / days).toFixed(2)),
                  })),
                  "ranking-estacoes"
                )}
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {stnLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : (
            <DownloadableChart filename="top15-estacoes-receita">
            <ResponsiveContainer width="100%" height={Math.max(280, top15Rev.length * 26)}>
              <BarChart
                data={top15Rev}
                layout="vertical"
                margin={{ top: 4, right: 48, left: 8, bottom: 0 }}
                onClick={(e) => e?.activePayload?.[0]?.payload?.station && setSelectedStation(e.activePayload[0].payload.station)}
                style={{ cursor: "pointer" }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `R$${v.toFixed(0)}`} />
                <YAxis type="category" dataKey="station" tick={{ fontSize: 10 }} width={130} />
                <Tooltip
                  formatter={(v: number) => [formatCurrency(v), "Receita"]}
                  labelFormatter={(label: string) => `${label} · clique para detalhes`}
                  cursor={{ fill: "var(--chart-grid)", opacity: 0.6 }}
                />
                <Bar dataKey="revenue" radius={[0, 3, 3, 0]} name="Receita">
                  {top15Rev.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={`hsl(${210 + (i / Math.max(top15Rev.length - 1, 1)) * 60}, 70%, ${45 + (i / Math.max(top15Rev.length - 1, 1)) * 15}%)`}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </DownloadableChart>
          )}
        </CardContent>
      </Card>

      {/* Top 15 por Sessões/Dia */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top 15 Estações por Sessões/Dia</CardTitle>
        </CardHeader>
        <CardContent>
          {stnLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : (
            <DownloadableChart filename="top15-estacoes-sessoes-dia">
            <ResponsiveContainer width="100%" height={Math.max(280, top15Sess.length * 26)}>
              <BarChart
                data={top15Sess}
                layout="vertical"
                margin={{ top: 4, right: 64, left: 8, bottom: 0 }}
                onClick={(e) => e?.activePayload?.[0]?.payload?.station && setSelectedStation(e.activePayload[0].payload.station)}
                style={{ cursor: "pointer" }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `${v.toFixed(1)}`}
                />
                <YAxis type="category" dataKey="station" tick={{ fontSize: 10 }} width={130} />
                <Tooltip
                  formatter={(v: number) => [`${v.toFixed(2)} sess/dia`, "Sessões/Dia"]}
                  labelFormatter={(label: string) => `${label} · clique para detalhes`}
                  cursor={{ fill: "var(--chart-grid)", opacity: 0.6 }}
                />
                <Bar dataKey="sessions_per_day" radius={[0, 3, 3, 0]} name="Sessões/Dia">
                  {top15Sess.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={`hsl(${160 + (i / Math.max(top15Sess.length - 1, 1)) * 40}, 65%, ${40 + (i / Math.max(top15Sess.length - 1, 1)) * 15}%)`}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </DownloadableChart>
          )}
        </CardContent>
      </Card>

      {/* Occupancy — horizontal bar (color-coded) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Taxa de Ocupação — Top 15 Carregadores (24h/dia)</CardTitle>
        </CardHeader>
        <CardContent>
          {stnLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : occupancy.length > 0 ? (
            <DownloadableChart filename="taxa-ocupacao-carregadores">
            <ResponsiveContainer width="100%" height={Math.max(280, occupancy.length * 26)}>
              <BarChart
                data={[...occupancy].sort((a, b) => b.occupancy_pct - a.occupancy_pct).slice(0, 15)}
                layout="vertical"
                margin={{ top: 4, right: 48, left: 8, bottom: 0 }}
                onClick={(e) => e?.activePayload?.[0]?.payload?.station && setSelectedStation(e.activePayload[0].payload.station)}
                style={{ cursor: "pointer" }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <YAxis type="category" dataKey="station" tick={{ fontSize: 10 }} width={130} />
                <Tooltip
                  formatter={(v: number) => [formatPct(v), "Ocupação"]}
                  labelFormatter={(label: string) => `${label} · clique para detalhes`}
                  cursor={{ fill: "var(--chart-grid)", opacity: 0.6 }}
                />
                <Bar dataKey="occupancy_pct" radius={[0, 3, 3, 0]} name="Ocupação">
                  {[...occupancy]
                    .sort((a, b) => b.occupancy_pct - a.occupancy_pct)
                    .slice(0, 15)
                    .map((entry, i) => (
                      <Cell key={i} fill={occColor(entry.occupancy_pct)} />
                    ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </DownloadableChart>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">Sem dados suficientes</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-[0.68rem] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500" /> ≥ 80%</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-500" /> 50–79%</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500" /> &lt; 50%</span>
          </div>
        </CardContent>
      </Card>

      {/* Connectors — dual horizontal bar (sessions + revenue) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Conectores — Sessões e Receita por Tipo</CardTitle>
        </CardHeader>
        <CardContent>
          {connLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : connectorData.length > 0 ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Sessões por tipo</p>
                <DownloadableChart filename="conectores-sessoes">
                <ResponsiveContainer width="100%" height={Math.max(160, connectorData.length * 40)}>
                  <BarChart data={connectorData} layout="vertical" margin={{ top: 4, right: 32, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="connector_type" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip formatter={(v: number) => [formatNumber(v), "Sessões"]} />
                    <Bar dataKey="sessions" radius={[0, 3, 3, 0]}>
                      {connectorData.map((entry, i) => (
                        <Cell key={i} fill={connectorColorMap[entry.connector_type]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                </DownloadableChart>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Receita por tipo</p>
                <DownloadableChart filename="conectores-receita">
                <ResponsiveContainer width="100%" height={Math.max(160, connectorData.length * 40)}>
                  <BarChart data={connectorData} layout="vertical" margin={{ top: 4, right: 32, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `R$${v.toFixed(0)}`} />
                    <YAxis type="category" dataKey="connector_type" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip formatter={(v: number) => [formatCurrency(v), "Receita"]} />
                    <Bar dataKey="revenue" radius={[0, 3, 3, 0]}>
                      {connectorData.map((entry, i) => (
                        <Cell key={i} fill={connectorColorMap[entry.connector_type]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                </DownloadableChart>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">Sem dados de conectores</p>
          )}
        </CardContent>
      </Card>

      {/* Session duration KPIs */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Duração Média das Sessões</p>
            <p className="text-2xl font-bold mt-1 text-blue-600">
              {durLoading ? "..." : `${avgDuration.toFixed(0)} min`}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Duração Mediana das Sessões</p>
            <p className="text-2xl font-bold mt-1 text-purple-600">
              {durLoading ? "..." : `${medianDuration.toFixed(0)} min`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Session duration distribution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Distribuição da Duração das Sessões e Ticket Médio</CardTitle>
        </CardHeader>
        <CardContent>
          {durLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : durBuckets.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sem dados de duração</p>
          ) : (
            <DownloadableChart filename="duracao-sessoes-ticket">
              <ResponsiveContainer width="100%" height={288}>
                <ComposedChart data={durBuckets} margin={{ top: 4, right: 48, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} width={40} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `R$${v.toFixed(0)}`} width={52} />
                  <Tooltip formatter={(v: number, name: string) => {
                    if (name === "sessions") return [formatNumber(v), "Sessões"];
                    if (name === "avg_ticket") return [formatCurrency(v), "Ticket Médio"];
                    return [v, name];
                  }} />
                  <Legend formatter={(v: string) => ({ sessions: "Sessões", avg_ticket: "Ticket Médio" }[v] ?? v)} />
                  <Bar yAxisId="left" dataKey="sessions" fill="#2563eb" radius={[3, 3, 0, 0]} name="sessions">
                    {durBuckets.map((_, i) => (
                      <Cell key={i} fill={`hsl(${210 + (i / Math.max(durBuckets.length - 1, 1)) * 60}, 70%, ${45 + (i / Math.max(durBuckets.length - 1, 1)) * 15}%)`} />
                    ))}
                  </Bar>
                  <Line yAxisId="right" type="monotone" dataKey="avg_ticket" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4 }} name="avg_ticket" />
                </ComposedChart>
              </ResponsiveContainer>
            </DownloadableChart>
          )}
        </CardContent>
      </Card>

      {/* User segmentation */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Segmentação de Usuários e Receita por Segmento</CardTitle>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Usuários por segmento</p>
                <DownloadableChart filename="usuarios-por-segmento">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={userSegments} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={40} />
                    <Tooltip formatter={(v: number) => [formatNumber(v), "Usuários"]} />
                    <Bar dataKey="users" radius={[3, 3, 0, 0]}>
                      {userSegments.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                </DownloadableChart>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Receita por segmento</p>
                <DownloadableChart filename="receita-por-segmento">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={userSegments} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `R$${v.toFixed(0)}`} width={56} />
                    <Tooltip formatter={(v: number) => [formatCurrency(v), "Receita"]} />
                    <Bar dataKey="revenue" radius={[3, 3, 0, 0]}>
                      {userSegments.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                </DownloadableChart>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </>
  );
}
