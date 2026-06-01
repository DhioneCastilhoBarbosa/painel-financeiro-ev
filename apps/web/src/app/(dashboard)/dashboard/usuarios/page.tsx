"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterBar } from "@/components/FilterBar";
import { EmptyState } from "@/components/EmptyState";
import { Separator } from "@/components/ui/separator";
import { useFilters } from "@/contexts/FilterContext";
import { useUsersDeep, useCohort } from "@/hooks/useAnalytics";
import { formatCurrency, formatNumber, formatPct } from "@/lib/format";
import { DownloadableChart } from "@/components/DownloadableChart";
import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportToCSV } from "@/lib/exportCSV";
import { cn } from "@/lib/utils";
import { UserDetailDrawer } from "@/components/UserDetailDrawer";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, LineChart, Line, Legend,
} from "recharts";

const COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316"];

// ── Cohort ────────────────────────────────────────────────────────────────────
interface CohortRow {
  cohort: string;
  size: number;
  retention: Record<string, number | null>;
}

function retentionColor(pct: number | null): string {
  if (pct === null) return "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400";
  if (pct >= 80) return "bg-emerald-500 text-white";
  if (pct >= 60) return "bg-emerald-400 text-white";
  if (pct >= 40) return "bg-amber-400 text-white";
  if (pct >= 20) return "bg-orange-400 text-white";
  return "bg-red-400 text-white";
}

interface TopUser {
  rank: number;
  user_name: string | null;
  user_tag: string;
  display_label: string;
  sessions: number;
  revenue: number;
  avg_ticket: number;
  avg_duration: number;
  kwh: number;
  voucher_sessions: number;
  voucher_pct: number;
}

interface VoucherSegment {
  label: string;
  users: number;
  voucher_users: number;
  voucher_pct: number;
}

interface VoucherData {
  total_sessions: number;
  total_users: number;
  retained_users: number;
  retention_rate: number;
  by_segment: VoucherSegment[];
}

interface EvolutionPoint {
  period: string;
  active: number;
  new: number;
  returning: number;
  churned: number;
  churn_rate: number;
}

interface UsersDeep {
  top_users: TopUser[];
  voucher: VoucherData;
  evolution: {
    weekly: EvolutionPoint[];
    monthly: EvolutionPoint[];
    quarterly: EvolutionPoint[];
  };
}

export default function UsuariosPage() {
  const { filters } = useFilters();
  const { data, isLoading } = useUsersDeep(filters);
  const { data: cohortData, isLoading: cohortLoading } = useCohort(filters);
  const [evolGranularity, setEvolGranularity] = useState<"weekly" | "monthly" | "quarterly">("monthly");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  const cohorts: CohortRow[] = cohortData?.cohorts ?? [];
  const cohortMonths: string[] = cohortData?.months ?? [];

  const d = data as UsersDeep | undefined;
  const topUsers: TopUser[] = d?.top_users ?? [];
  const voucher: VoucherData | undefined = d?.voucher;
  const evolution: EvolutionPoint[] = d?.evolution?.[evolGranularity] ?? [];
  const voucherSegments: VoucherSegment[] = voucher?.by_segment ?? [];

  if (!isLoading && topUsers.length === 0) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Usuários</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Análise de comportamento, vouchers e evolução da base</p>
          </div>
          <FilterBar />
        </div>
        <EmptyState
          title="Nenhum dado de usuário disponível"
          description="Importe um arquivo Excel para visualizar análises de comportamento e evolução da base de usuários."
          actionLabel="Importar arquivo"
          actionHref="/dashboard/files"
        />
      </div>
    );
  }

  return (
    <>
    <UserDetailDrawer
      userTag={selectedUser}
      filters={filters}
      onClose={() => setSelectedUser(null)}
    />
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usuários</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Clique em um usuário para ver detalhes</p>
        </div>
        <FilterBar />
      </div>

      {/* Top users table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Top 20 Usuários por Sessões</CardTitle>
            {topUsers.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => exportToCSV(
                  topUsers.map(u => ({
                    rank: u.rank,
                    usuario: u.display_label,
                    sessoes: u.sessions,
                    receita: u.revenue,
                    ticket_medio: u.avg_ticket,
                    duracao_media_min: Number(u.avg_duration.toFixed(0)),
                    kwh: Number(u.kwh.toFixed(1)),
                    sessoes_voucher: u.voucher_sessions,
                    pct_voucher: Number(u.voucher_pct.toFixed(1)),
                  })),
                  "top-usuarios"
                )}
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : topUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sem dados</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left pb-2 pr-3">#</th>
                    <th className="text-left pb-2 pr-3">Usuário (Nome / Tag)</th>
                    <th className="text-right pb-2 pr-3">Sessões</th>
                    <th className="text-right pb-2 pr-3">Receita</th>
                    <th className="text-right pb-2 pr-3">Ticket Médio</th>
                    <th className="text-right pb-2 pr-3">Duração Média</th>
                    <th className="text-right pb-2 pr-3">kWh</th>
                    <th className="text-right pb-2 pr-3">Sessões c/ Voucher</th>
                    <th className="text-right pb-2">% Voucher</th>
                  </tr>
                </thead>
                <tbody>
                  {topUsers.map((u) => (
                    <tr
                      key={u.user_tag}
                      className="border-b last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                      onClick={() => setSelectedUser(u.user_tag)}
                    >
                      <td className="py-2 pr-3 text-muted-foreground">{u.rank}</td>
                      <td className="py-2 pr-3">
                        {u.user_name
                          ? <><span className="font-medium">{u.user_name}</span> <span className="text-muted-foreground font-mono text-xs">[{u.user_tag}]</span></>
                          : <span className="font-mono text-xs text-muted-foreground">{u.user_tag}</span>
                        }
                      </td>
                      <td className="py-2 pr-3 text-right font-medium">{formatNumber(u.sessions)}</td>
                      <td className="py-2 pr-3 text-right text-emerald-600 font-medium">{formatCurrency(u.revenue)}</td>
                      <td className="py-2 pr-3 text-right">{formatCurrency(u.avg_ticket)}</td>
                      <td className="py-2 pr-3 text-right">{u.avg_duration.toFixed(0)} min</td>
                      <td className="py-2 pr-3 text-right">{u.kwh.toFixed(1)}</td>
                      <td className="py-2 pr-3 text-right">{formatNumber(u.voucher_sessions)}</td>
                      <td className="py-2 text-right">
                        <span className={u.voucher_pct > 50 ? "text-amber-600 font-medium" : "text-muted-foreground"}>
                          {formatPct(u.voucher_pct)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top users chart — sessions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Sessões por Usuário (Top 20)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : (
            <DownloadableChart filename="top-usuarios-sessoes">
              <ResponsiveContainer width="100%" height={Math.max(280, topUsers.length * 24)}>
                <BarChart
                  data={topUsers}
                  layout="vertical"
                  margin={{ top: 4, right: 48, left: 8, bottom: 0 }}
                  onClick={(e) => {
                    const tag = (e?.activePayload?.[0]?.payload as TopUser | undefined)?.user_tag;
                    if (tag) setSelectedUser(tag);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="display_label" tick={{ fontSize: 10 }} width={120} />
                  <Tooltip formatter={(v: number) => [formatNumber(v), "Sessões"]} cursor={{ fill: "var(--chart-grid)", opacity: 0.5 }} />
                  <Bar dataKey="sessions" radius={[0, 3, 3, 0]}>
                    {topUsers.map((_, i) => (
                      <Cell key={i} fill={`hsl(${210 + (i / Math.max(topUsers.length - 1, 1)) * 60}, 70%, ${45 + (i / Math.max(topUsers.length - 1, 1)) * 15}%)`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </DownloadableChart>
          )}
        </CardContent>
      </Card>

      {/* Voucher analysis — hidden when no voucher data */}
      {(isLoading || (voucher?.total_sessions ?? 0) > 0) && <>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">Sessões com Voucher</p>
              <div className="text-2xl font-bold mt-1 text-amber-600">
                {isLoading ? <Skeleton className="h-8 w-24" /> : formatNumber(voucher?.total_sessions ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {voucher?.total_users ?? 0} usuários únicos
              </p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">Usuários Retidos pós-Voucher</p>
              <div className="text-2xl font-bold mt-1 text-blue-600">
                {isLoading ? <Skeleton className="h-8 w-24" /> : formatNumber(voucher?.retained_users ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">voltaram sem usar voucher</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">Taxa de Retenção Voucher</p>
              <div className="text-2xl font-bold mt-1 text-emerald-600">
                {isLoading ? <Skeleton className="h-8 w-24" /> : formatPct(voucher?.retention_rate ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">de quem usou voucher voltou pago</p>
            </CardContent>
          </Card>
        </div>

        {/* Voucher by segment */}
        <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Concentração de Vouchers por Segmento de Usuário</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : voucherSegments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sem dados de voucher</p>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Usuários totais vs. com voucher por segmento</p>
                <DownloadableChart filename="voucher-por-segmento-usuarios">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={voucherSegments} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={40} />
                      <Tooltip formatter={(v: number, name: string) => [formatNumber(v), name === "users" ? "Total" : "c/ Voucher"]} />
                      <Legend formatter={(v: string) => v === "users" ? "Total" : "c/ Voucher"} />
                      <Bar dataKey="users" fill="#cbd5e1" radius={[3, 3, 0, 0]} name="users" />
                      <Bar dataKey="voucher_users" fill="#f59e0b" radius={[3, 3, 0, 0]} name="voucher_users" />
                    </BarChart>
                  </ResponsiveContainer>
                </DownloadableChart>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">% usuários c/ voucher por segmento</p>
                <DownloadableChart filename="voucher-por-segmento-pct">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={voucherSegments} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v.toFixed(0)}%`} width={40} />
                      <Tooltip formatter={(v: number) => [formatPct(v), "% c/ Voucher"]} />
                      <Bar dataKey="voucher_pct" radius={[3, 3, 0, 0]}>
                        {voucherSegments.map((_, i) => (
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
      </>}

      {/* User base evolution */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Evolução da Base de Usuários</CardTitle>
          <Tabs value={evolGranularity} onValueChange={(v) => setEvolGranularity(v as typeof evolGranularity)}>
            <TabsList className="h-7">
              <TabsTrigger value="weekly" className="text-xs px-2.5">Semanal</TabsTrigger>
              <TabsTrigger value="monthly" className="text-xs px-2.5">Mensal</TabsTrigger>
              <TabsTrigger value="quarterly" className="text-xs px-2.5">Trimestral</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : evolution.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Dados insuficientes para evolução</p>
          ) : (
            <DownloadableChart filename={`evolucao-usuarios-${evolGranularity}`}>
              <ResponsiveContainer width="100%" height={288}>
                <BarChart data={evolution} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={40} />
                  <Tooltip formatter={(v: number, name: string) => {
                    const labels: Record<string, string> = { new: "Novos", returning: "Recorrentes", churned: "Churnados" };
                    return [formatNumber(v), labels[name] ?? name];
                  }} />
                  <Legend formatter={(v: string) => ({ new: "Novos", returning: "Recorrentes", churned: "Churnados" }[v] ?? v)} />
                  <Bar dataKey="new" stackId="a" fill="#2563eb" name="new" />
                  <Bar dataKey="returning" stackId="a" fill="#10b981" name="returning" />
                  <Bar dataKey="churned" stackId="a" fill="#ef4444" name="churned" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </DownloadableChart>
          )}
        </CardContent>
      </Card>

      {/* Churn rate */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Taxa de Churn por Período</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : evolution.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Dados insuficientes</p>
          ) : (
            <DownloadableChart filename={`churn-${evolGranularity}`}>
              <ResponsiveContainer width="100%" height={208}>
                <LineChart data={evolution} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v.toFixed(0)}%`} width={48} />
                  <Tooltip formatter={(v: number) => [formatPct(v), "Churn"]} />
                  <Line type="monotone" dataKey="churn_rate" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="churn_rate" />
                </LineChart>
              </ResponsiveContainer>
            </DownloadableChart>
          )}
        </CardContent>
      </Card>

      {/* Active users line */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Usuários Ativos por Período</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : evolution.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Dados insuficientes</p>
          ) : (
            <DownloadableChart filename={`usuarios-ativos-${evolGranularity}`}>
              <ResponsiveContainer width="100%" height={208}>
                <LineChart data={evolution} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={40} />
                  <Tooltip formatter={(v: number) => [formatNumber(v), "Usuários Ativos"]} />
                  <Line type="monotone" dataKey="active" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3 }} name="active" />
                </LineChart>
              </ResponsiveContainer>
            </DownloadableChart>
          )}
        </CardContent>
      </Card>

      {/* ── Análise de Coorte ──────────────────────────────────────────────── */}
      <Separator />
      <div>
        <h2 className="text-lg font-semibold">Análise de Coorte</h2>
        <p className="text-muted-foreground text-sm mt-0.5">
          Retenção de usuários por mês de primeiro acesso — cada célula mostra a % que voltou
        </p>
      </div>

      {!cohortLoading && cohorts.length === 0 ? (
        <EmptyState
          title="Dados insuficientes para análise de coorte"
          description="É necessário pelo menos 2 meses de dados para gerar a matriz de retenção."
          actionLabel="Importar arquivo"
          actionHref="/dashboard/files"
        />
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Matriz de Retenção</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {cohortLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <table className="text-xs border-separate border-spacing-0.5 min-w-full">
                  <thead>
                    <tr>
                      <th className="text-left font-semibold p-2 text-slate-700 dark:text-slate-300 min-w-[90px]">Coorte</th>
                      <th className="text-right font-semibold p-2 text-slate-600 dark:text-slate-400 min-w-[60px]">Usuários</th>
                      {cohortMonths.map((m) => (
                        <th key={m} className="text-center font-semibold p-2 text-slate-700 dark:text-slate-300 min-w-[56px]">
                          {m}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cohorts.map((row) => (
                      <tr key={row.cohort}>
                        <td className="p-2 font-medium text-slate-700 dark:text-slate-300">{row.cohort}</td>
                        <td className="p-2 text-right text-slate-600 dark:text-slate-300">{row.size}</td>
                        {cohortMonths.map((m) => {
                          const val = row.retention[m] ?? null;
                          return (
                            <td key={m} className="p-0.5">
                              <div
                                className={cn(
                                  "rounded text-center py-1.5 px-1 font-medium tabular-nums",
                                  retentionColor(val)
                                )}
                              >
                                {val !== null ? `${val}%` : "—"}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {!cohortLoading && cohorts.length > 0 && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span className="font-medium">Legenda:</span>
              {[
                { label: "≥80%", cls: "bg-emerald-500" },
                { label: "60–80%", cls: "bg-emerald-400" },
                { label: "40–60%", cls: "bg-amber-400" },
                { label: "20–40%", cls: "bg-orange-400" },
                { label: "<20%", cls: "bg-red-400" },
                { label: "Sem dados", cls: "bg-slate-200 dark:bg-slate-700" },
              ].map(({ label, cls }) => (
                <span key={label} className="flex items-center gap-1">
                  <span className={cn("inline-block h-3 w-5 rounded", cls)} />
                  {label}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
    </>
  );
}
