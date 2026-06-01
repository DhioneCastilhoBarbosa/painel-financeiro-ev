"use client";

import { useState } from "react";
import { X, User, StickyNote, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useUserDetail, useUserNote } from "@/hooks/useAnalytics";
import { formatCurrency, formatNumber, formatPct } from "@/lib/format";
import type { FilterParams } from "@/lib/types";
import api from "@/lib/api";
import { mutate } from "swr";
import { toast } from "sonner";
import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from "recharts";

interface Props {
  userTag: string | null;
  filters: FilterParams;
  onClose: () => void;
}

const COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export function UserDetailDrawer({ userTag, filters, onClose }: Props) {
  const { data, isLoading } = useUserDetail(userTag, filters);
  const { data: noteData } = useUserNote(userTag);
  const [noteText, setNoteText] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);

  const currentNote = noteText ?? (noteData?.content ?? "");

  const saveNote = async () => {
    if (!userTag) return;
    setSavingNote(true);
    try {
      await api.put(`/user-notes/${encodeURIComponent(userTag)}`, { content: currentNote });
      await mutate(`/user-notes/${encodeURIComponent(userTag)}`);
      setNoteText(null);
      toast.success("Nota salva");
    } catch {
      toast.error("Erro ao salvar nota");
    } finally {
      setSavingNote(false);
    }
  };

  if (!userTag) return null;

  const kpis = data?.kpis ?? {};
  const timeseries: Array<{ date: string; revenue: number; sessions: number }> = data?.timeseries ?? [];
  const stations: Array<{ station: string; sessions: number; revenue: number }> = data?.stations ?? [];
  const recentSessions: Array<{
    date: string; station: string; revenue: number;
    kwh: number; duration_min: number; status: string; voucher: boolean;
  }> = data?.recent_sessions ?? [];

  const displayName = kpis.user_name ?? userTag;

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
          <div className="rounded-full bg-violet-100 dark:bg-violet-950 p-2">
            <User className="h-4 w-4 text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-sm truncate">{displayName}</h2>
            <p className="text-[0.65rem] font-mono text-muted-foreground">{userTag}</p>
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
              { label: "% Voucher", value: isLoading ? null : formatPct(kpis.voucher_pct ?? 0) },
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

          {/* Spending timeseries */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Receita por Dia</p>
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : timeseries.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <ComposedChart data={timeseries} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="userGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
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
                  <Area type="monotone" dataKey="revenue" stroke="#7c3aed" strokeWidth={2} fill="url(#userGrad)" />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Top stations */}
          {stations.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Estações Frequentadas</p>
              <ResponsiveContainer width="100%" height={Math.max(100, stations.length * 28)}>
                <BarChart data={stations} layout="vertical" margin={{ top: 0, right: 32, left: 8, bottom: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="station" tick={{ fontSize: 10 }} width={120} />
                  <Tooltip formatter={(v: number) => [formatNumber(v), "Sessões"]} />
                  <Bar dataKey="sessions" radius={[0, 3, 3, 0]}>
                    {stations.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Recent sessions */}
          {recentSessions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Sessões Recentes</p>
              <div className="space-y-1 text-xs">
                {recentSessions.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 py-1.5 border-b dark:border-slate-800 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{s.station}</p>
                      <p className="text-muted-foreground">{s.date} · {s.duration_min} min · {s.kwh.toFixed(1)} kWh</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-medium">{formatCurrency(s.revenue)}</p>
                      <div className="flex items-center gap-1 justify-end mt-0.5">
                        {s.voucher && (
                          <Badge variant="secondary" className="text-[0.6rem] px-1 py-0">Voucher</Badge>
                        )}
                        <span className={s.status === "paid" || s.status === "PAID" ? "text-emerald-600" : "text-amber-500"}>
                          {s.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notas Internas</p>
            </div>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 dark:bg-slate-800 dark:border-slate-700"
              rows={4}
              placeholder="Adicione notas sobre este usuário..."
              value={currentNote}
              onChange={(e) => setNoteText(e.target.value)}
            />
            {noteText !== null && noteText !== (noteData?.content ?? "") && (
              <Button
                size="sm"
                className="mt-1.5 h-7 text-xs gap-1.5"
                onClick={saveNote}
                disabled={savingNote}
              >
                <Check className="h-3.5 w-3.5" />
                {savingNote ? "Salvando..." : "Salvar nota"}
              </Button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
