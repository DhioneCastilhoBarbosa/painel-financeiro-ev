"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency, formatNumber } from "@/lib/format";

interface TriggeredAlert {
  id: string;
  name: string;
  metric: string;
  operator: string;
  threshold: number;
  current_value: number;
  channel: string;
}

export interface EvaluateResult {
  triggered: TriggeredAlert[];
  evaluated_at: string;
  metrics: Record<string, number>;
}

const METRIC_LABELS: Record<string, string> = {
  revenue_day: "Receita ontem",
  revenue_session: "Receita/sessão",
  sessions_day: "Sessões ontem",
  occupancy_pct: "Ocupação",
};

function formatValue(metric: string, value: number): string {
  if (metric === "revenue_day" || metric === "revenue_session") return formatCurrency(value);
  if (metric === "occupancy_pct") return `${value.toFixed(1)}%`;
  return formatNumber(value);
}

export function AlertBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EvaluateResult | null>(null);

  const canManage = user?.role === "owner" || user?.role === "admin";

  const evaluate = useCallback(async (silent = false) => {
    setLoading(true);
    try {
      const { data } = await api.post<EvaluateResult>("/alerts/evaluate");
      setResult(data);
      if (!silent) {
        setOpen(true);
        if (data.triggered.length > 0) {
          toast.warning(`${data.triggered.length} alerta${data.triggered.length > 1 ? "s" : ""} disparado${data.triggered.length > 1 ? "s" : ""}!`);
        } else {
          toast.success("Todos os alertas dentro dos limites.");
        }
      }
    } catch {
      if (!silent) toast.error("Erro ao avaliar alertas");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-evaluate silently on mount so the badge shows without manual click
  useEffect(() => {
    if (canManage) evaluate(true);
  }, [canManage, evaluate]);

  if (!canManage) return null;

  const triggeredCount = result?.triggered.length ?? 0;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 relative"
        onClick={() => (open ? setOpen(false) : evaluate())}
        title="Verificar alertas"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Bell className="h-4 w-4" />
        )}
        {triggeredCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
            {triggeredCount}
          </span>
        )}
      </Button>

      {open && result && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Dropdown */}
          <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border bg-white dark:bg-slate-900 shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50 dark:bg-slate-800">
              <span className="text-sm font-semibold">Alertas — ontem</span>
              <button
                className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                onClick={() => evaluate()}
                title="Reavaliar"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Metrics summary */}
            {result.metrics && (
              <div className="grid grid-cols-2 gap-0 border-b">
                {Object.entries(result.metrics).map(([k, v]) => (
                  <div key={k} className="px-3 py-2 border-r last:border-r-0 even:border-r-0">
                    <p className="text-[10px] text-muted-foreground">{METRIC_LABELS[k] ?? k}</p>
                    <p className="text-sm font-semibold tabular-nums">{formatValue(k, v)}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Triggered alerts */}
            <div className="max-h-64 overflow-y-auto">
              {triggeredCount === 0 ? (
                <div className="flex items-center gap-2 px-4 py-4 text-sm text-emerald-600">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Todos os alertas dentro dos limites.
                </div>
              ) : (
                result.triggered.map((a) => (
                  <div key={a.id} className="flex items-start gap-3 px-4 py-3 border-b last:border-0">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {METRIC_LABELS[a.metric]}: <strong>{formatValue(a.metric, a.current_value)}</strong>
                        {" "}{a.operator === "below" ? "abaixo de" : "acima de"}{" "}
                        <strong>{formatValue(a.metric, a.threshold)}</strong>
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800 text-[10px] text-muted-foreground text-right">
              Avaliado em {new Date(result.evaluated_at).toLocaleTimeString("pt-BR")}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
