"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Upload, BarChart3, Bell, Loader2, Zap, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import useSWR, { mutate } from "swr";

const DISMISSED_KEY = "fd_onboarding_dismissed_v1";

interface ExampleDataset {
  name: string;
  filename: string;
  available: boolean;
}

const fetcher = (url: string) => api.get(url).then((r) => r.data);

interface Step {
  icon: React.ReactNode;
  label: string;
  description: string;
  done: boolean;
}

interface Props {
  hasFiles: boolean;
  hasAlerts: boolean;
}

export function DashboardOnboarding({ hasFiles, hasAlerts }: Props) {
  const router = useRouter();
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(DISMISSED_KEY) === "1";
  });

  const { data: examples } = useSWR<ExampleDataset[]>("/files/examples", fetcher);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  };

  const loadDemo = async () => {
    const available = examples?.find((e) => e.available);
    if (!available) {
      toast.error("Nenhum dataset de exemplo disponível");
      return;
    }
    setLoadingDemo(true);
    try {
      await api.post(`/files/examples/${encodeURIComponent(available.name)}/load`);
      toast.success(`Dataset "${available.name}" carregado! Atualizando dashboard...`);
      await mutate("/files");
      // Invalidate all analytics caches so dashboard re-fetches with new data
      await mutate((key) => Array.isArray(key) && typeof key[0] === "string" && key[0].startsWith("/analytics"));
      router.refresh();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? "Erro ao carregar dados de demonstração");
    } finally {
      setLoadingDemo(false);
    }
  };

  if (dismissed) return null;

  const steps: Step[] = [
    {
      icon: <Zap className="h-4 w-4" />,
      label: "Criar conta",
      description: "Conta criada e autenticada",
      done: true,
    },
    {
      icon: <Upload className="h-4 w-4" />,
      label: "Importar dados",
      description: "Faça upload de uma planilha Excel da plataforma Intelbras",
      done: hasFiles,
    },
    {
      icon: <BarChart3 className="h-4 w-4" />,
      label: "Explorar o dashboard",
      description: "Visualize receita, sessões, estações e muito mais",
      done: hasFiles,
    },
    {
      icon: <Bell className="h-4 w-4" />,
      label: "Criar primeiro alerta",
      description: "Configure notificações para métricas fora do esperado",
      done: hasAlerts,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const progressPct = Math.round((completedCount / steps.length) * 100);

  return (
    <Card className="border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-slate-50 dark:from-blue-950/30 dark:to-slate-900">
      <CardContent className="pt-5 pb-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
              <Zap className="h-5 w-5 text-white fill-current" />
            </div>
            <div>
              <h2 className="font-semibold text-base">Bem-vindo ao Intelbras Finance!</h2>
              <p className="text-sm text-muted-foreground">
                {completedCount === steps.length
                  ? "Tudo pronto — explore o dashboard completo"
                  : `${completedCount} de ${steps.length} etapas concluídas`}
              </p>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground transition-colors mt-0.5"
            title="Dispensar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mb-5 overflow-hidden">
          <div
            className="h-full bg-blue-600 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {steps.map((step, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                step.done
                  ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
                  : "bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
              }`}
            >
              <div className={`mt-0.5 shrink-0 ${step.done ? "text-emerald-500" : "text-slate-400"}`}>
                {step.done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
              </div>
              <div className="min-w-0">
                <p className={`text-sm font-medium ${step.done ? "line-through text-muted-foreground" : ""}`}>
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground leading-snug mt-0.5">{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTAs */}
        {!hasFiles && (
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/files" className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}>
              <Upload className="h-3.5 w-3.5" />
              Importar arquivo Excel
            </Link>
            {examples && examples.some((e) => e.available) && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={loadDemo}
                disabled={loadingDemo}
              >
                {loadingDemo ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <BarChart3 className="h-3.5 w-3.5" />
                )}
                Explorar com dados de demonstração
              </Button>
            )}
          </div>
        )}
        {hasFiles && !hasAlerts && (
          <Link href="/dashboard/settings" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
            <Bell className="h-3.5 w-3.5" />
            Criar primeiro alerta
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
