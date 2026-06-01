"use client";

import { X, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useStationDetail } from "@/hooks/useAnalytics";
import { formatCurrency, formatNumber, formatPct } from "@/lib/format";
import type { FilterParams } from "@/lib/types";
import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from "recharts";

interface Props {
  stationName: string | null;
  filters: FilterParams;
  onClose: () => void;
}

const COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export function StationDetailDrawer({ stationName, filters, onClose }: Props) {
  const { data, isLoading } = useStationDetail(stationName, filters);

  if (!stationName) return null;

  const kpis = data?.kpis ?? {};
  const timeseries: Array<{ date: string; revenue: number; sessions: number }> = data?.timeseries ?? [];
  const topUsers: Array<{ user_tag: string; user_name: string | null; sessions: number; revenue: number }> = data?.top_users ?? [];
  const connectors: Array<{ connector_type: string; sessions: number; revenue: number }> = data?.connectors ?? [];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
      />
      {/* Drawer */}
      <aside className="fixed right-0 top-0 h-full w-full max-w-lg bg-white dark:bg-slate-900 border-l dark:border-slate-800 shadow-xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b dark:border-slate-800 shrink-0">
          <div className="rounded-full bg-blue-100 dark:bg-blue-950 p-2">
            <Zap className="h-4 w-4 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-sm truncate">{stationName}</h2>
            <p className="text-xs text-muted-foreground">Detalhamento da estação</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* KPI chips */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Receita Total", value: isLoading ? null : formatCurrency(kpis.revenue ?? 0) },
              { label: "Sessões", value: isLoading ? null : formatNumber(kpis.total_sessions ?? 0) },
              { label: "Ticket Médio", value: isLoading ? null : formatCurrency(kpis.avg_ticket ?? 0) },
              { label: "Energia", value: isLoading ? null : `${(kpis.energy_kwh ?? 0).toFixed(1)} kWh` },
            ].map(({ label, value }) => (
              <Card key={label}>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  {value === null
                    ? <Skeleton className="h-6 w-20 mt-1" />
                    : <p className="text-lg font-bold mt-0.5">{value}</p>
                  }
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Revenue timeseries */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Receita Diária</p>
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : timeseries.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <ComposedChart data={timeseries} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="stnGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: string) => {
                      const d = new Date(v + "T00:00:00");
                      return `${d.getDate()}/${d.getMonth() + 1}`;
                    }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `R$${v}`} width={52} />
                  <Tooltip
                    formatter={(v: number, name: string) =>
                      name === "revenue" ? [formatCurrency(v), "Receita"] : [formatNumber(v), "Sessões"]
                    }
                    labelFormatter={(l: string) => new Date(l + "T00:00:00").toLocaleDateString("pt-BR")}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} fill="url(#stnGrad)" />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Connectors */}
          {connectors.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Conectores</p>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={connectors} layout="vertical" margin={{ top: 0, right: 32, left: 8, bottom: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => formatNumber(v)} />
                  <YAxis type="category" dataKey="connector_type" tick={{ fontSize: 10 }} width={80} />
                  <Tooltip formatter={(v: number) => [formatNumber(v), "Sessões"]} />
                  <Bar dataKey="sessions" radius={[0, 3, 3, 0]}>
                    {connectors.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top users */}
          {topUsers.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Top Usuários</p>
              <div className="space-y-1">
                {topUsers.map((u, i) => (
                  <div key={u.user_tag} className="flex items-center gap-3 py-1.5 border-b dark:border-slate-800 last:border-0">
                    <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{u.user_name ?? u.user_tag}</p>
                      {u.user_name && (
                        <p className="text-[0.65rem] text-muted-foreground font-mono">{u.user_tag}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium">{formatNumber(u.sessions)} sess.</p>
                      <p className="text-[0.65rem] text-emerald-600">{formatCurrency(u.revenue)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
