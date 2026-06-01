"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Loader2, ExternalLink, CreditCard, Zap } from "lucide-react";
import { toast } from "sonner";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { formatDate } from "@/lib/format";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

interface Plan {
  id: string;
  name: string;
  price_label: string;
  limits: { users: number; files: number };
  features: string[];
}

interface Subscription {
  plan: string;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  trialing: "Trial",
  active: "Ativo",
  past_due: "Pagamento pendente",
  canceled: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  trialing: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
  past_due: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
  canceled: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

export default function BillingPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [loadingPortal, setLoadingPortal] = useState(false);

  const { data: plans, isLoading: plansLoading } = useSWR<Plan[]>("/billing/plans", fetcher);
  const { data: sub, isLoading: subLoading } = useSWR<Subscription>("/billing/subscription", fetcher);

  useEffect(() => {
    if (searchParams.get("success") === "1") {
      toast.success("Assinatura ativada com sucesso!");
    } else if (searchParams.get("canceled") === "1") {
      toast.info("Checkout cancelado.");
    }
  }, [searchParams]);

  const handleCheckout = async (planId: string) => {
    setLoadingPlan(planId);
    try {
      const { data } = await api.post("/billing/checkout", { plan: planId });
      window.location.href = data.checkout_url;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? "Erro ao iniciar checkout");
      setLoadingPlan(null);
    }
  };

  const handlePortal = async () => {
    setLoadingPortal(true);
    try {
      const { data } = await api.post("/billing/portal");
      window.location.href = data.portal_url;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? "Erro ao abrir portal de cobrança");
      setLoadingPortal(false);
    }
  };

  const isOwner = user?.role === "owner";
  const currentPlan = sub?.plan ?? "trial";
  const hasActiveSubscription = sub?.stripe_customer_id != null;

  const trialDaysLeft = (() => {
    if (!sub?.trial_ends_at) return null;
    const diff = new Date(sub.trial_ends_at).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 86400000));
  })();

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Plano & Cobrança</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Gerencie sua assinatura e dados de cobrança</p>
      </div>

      {/* Current plan status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Assinatura atual
          </CardTitle>
        </CardHeader>
        <CardContent>
          {subLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          ) : (
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold capitalize">
                    {currentPlan === "trial" ? "Trial gratuito" : currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}
                  </span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_COLORS[sub?.status ?? "trialing"]}`}>
                    {STATUS_LABELS[sub?.status ?? "trialing"]}
                  </span>
                </div>
                {sub?.status === "trialing" && trialDaysLeft !== null && (
                  <p className="text-sm text-muted-foreground">
                    {trialDaysLeft > 0
                      ? `Trial expira em ${trialDaysLeft} dia${trialDaysLeft !== 1 ? "s" : ""} (${formatDate(sub.trial_ends_at!)})`
                      : "Trial expirado"}
                  </p>
                )}
                {sub?.current_period_end && sub.status === "active" && (
                  <p className="text-sm text-muted-foreground">
                    Próxima renovação: {formatDate(sub.current_period_end)}
                  </p>
                )}
              </div>
              {hasActiveSubscription && isOwner && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePortal}
                  disabled={loadingPortal}
                  className="gap-1.5"
                >
                  {loadingPortal ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ExternalLink className="h-3.5 w-3.5" />
                  )}
                  Gerenciar cobrança
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Plan cards */}
      <div>
        <h2 className="text-base font-semibold mb-4">Escolha um plano</h2>
        {plansLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {plans?.map((plan) => {
              const isCurrent = currentPlan === plan.id;
              const isLoading = loadingPlan === plan.id;

              return (
                <Card key={plan.id} className={isCurrent ? "border-blue-500 ring-1 ring-blue-500" : ""}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Zap className="h-4 w-4 text-blue-600" />
                        {plan.name}
                      </CardTitle>
                      {isCurrent && (
                        <Badge className="bg-blue-600 text-white text-xs">Plano atual</Badge>
                      )}
                    </div>
                    <CardDescription className="text-xl font-bold text-foreground mt-1">
                      {plan.price_label}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ul className="space-y-2">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm">
                          <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    {isOwner && (
                      <Button
                        className="w-full"
                        variant={isCurrent ? "outline" : "default"}
                        disabled={isCurrent || isLoading || loadingPlan !== null}
                        onClick={() => !isCurrent && handleCheckout(plan.id)}
                      >
                        {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        {isCurrent ? "Plano ativo" : `Assinar ${plan.name}`}
                      </Button>
                    )}
                    {!isOwner && (
                      <p className="text-xs text-muted-foreground text-center">
                        Apenas o proprietário pode alterar o plano.
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Trial warning */}
      {sub?.status === "trialing" && trialDaysLeft !== null && trialDaysLeft <= 3 && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="pt-4 flex items-start gap-3">
            <Zap className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Seu trial {trialDaysLeft === 0 ? "expirou" : `expira em ${trialDaysLeft} dia${trialDaysLeft !== 1 ? "s" : ""}`}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                Assine um plano para continuar tendo acesso a todos os recursos.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
