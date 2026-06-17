"use client";

import { DollarSign, Zap, Activity, Users, TrendingUp, Clock, AlertTriangle, BarChart2, Calculator } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { KPICard } from "@/components/KPICard";
import { FilterBar } from "@/components/FilterBar";
import { DashboardOnboarding } from "@/components/DashboardOnboarding";
import { useFilters } from "@/contexts/FilterContext";
import { useKPIs, useTimeseries, useHourly, useInsights, usePayments } from "@/hooks/useAnalytics";
import { formatCurrency, formatNumber, formatPct, formatKwh } from "@/lib/format";
import type { TimeSeriesPoint } from "@/lib/types";
import { DownloadableChart } from "@/components/DownloadableChart";
import Link from "next/link";
import useSWR from "swr";
import api from "@/lib/api";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { firstAccessibleRoute } from "@/lib/nav";
import {
  ComposedChart, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Line,
} from "recharts";

const PIE_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

const METHOD_LABELS: Record<string, string> = {
  PAGBANK_CARD: "PagBank Cartão",
  PAGBANK_PIX: "PagBank Pix",
  pagbank_pix: "PagBank Pix",
  WALLET: "Wallet",
  VOUCHER: "Voucher",
  MANUAL: "Manual",
  PIX: "Pix",
};

const fileFetcher = (url: string) => api.get(url).then((r) => r.data);

/**
 * Página inicial. Se o plano da organização NÃO inclui a Visão Geral
 * (dashboard_overview), redireciona o usuário para a primeira tela habilitada
 * em vez de mostrar um dashboard vazio com onboarding inútil.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { hasFeature, hasAnyFeature, isLoading } = usePlanFeatures();

  const overviewEnabled = hasFeature("dashboard_overview");

  // Destino do redirect (apenas quando carregado e overview desabilitado).
  const redirectTo =
    !isLoading && !overviewEnabled
      ? firstAccessibleRoute(user, hasFeature, hasAnyFeature)
      : null;

  useEffect(() => {
    if (redirectTo && redirectTo !== "/dashboard") {
      router.replace(redirectTo);
    }
  }, [redirectTo, router]);

  // Enquanto carrega as features, ou enquanto o redirect está em andamento,
  // mostra um placeholder discreto em vez do dashboard vazio.
  if (isLoading || (!overviewEnabled && redirectTo)) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="h-8 w-8 border-2 border-muted-foreground/30 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <OverviewContent />;
}

function OverviewContent() {
  const { filters } = useFilters();
  const { data: kpis, isLoading: kpisLoading } = useKPIs(filters);
  const { data: timeseries, isLoading: tsLoading } = useTimeseries(filters);
  const { data: hourly, isLoading: hourlyLoading } = useHourly(filters);
  const { data: insights } = useInsights(filters);
  const { data: payments } = usePayments(filters);
  const { data: files } = useSWR<{ id: string; status: string }[]>("/files", fileFetcher);
  const { data: alerts } = useSWR<{ id: string }[]>("/alerts", fileFetcher);

  const hasData = kpis && kpis.total_sessions > 0;
  const hasFiles = (files ?? []).some((f) => f.status === "done");
  const hasAlerts = (alerts ?? []).length > 0;

  const funnel: Array<{ label: string; value: number }> = payments?.funnel ?? [];
  const methods: Array<{ method: string; sessions: number; revenue: number }> = payments?.methods ?? [];

  const methodsForPie = methods.map(m => ({
    ...m,
    name: METHOD_LABELS[m.method] ?? m.method,
  }));

  // Compute 7-day moving average on timeseries
  const timeseriesWithMA = ((timeseries ?? []) as TimeSeriesPoint[]).map(
    (d, i, arr) => {
      const window = arr.slice(Math.max(0, i - 6), i + 1);
      const ma =
        window.reduce((sum, x) => sum + x.revenue, 0) / window.length;
      return { ...d, ma7: Math.round(ma * 100) / 100 };
    }
  );

  if (!kpisLoading && !hasData) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Visão Geral</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Importe arquivos Excel para ver seus dados</p>
          </div>
          <FilterBar />
        </div>
        <DashboardOnboarding hasFiles={hasFiles} hasAlerts={hasAlerts} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Visão Geral</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {hasData
              ? `${formatNumber(kpis.total_sessions)} sessões · ${kpis.days} dias de dados`
              : "Importe arquivos Excel para ver seus dados"}
          </p>
        </div>
        <FilterBar />
      </div>

      {/* Onboarding checklist — shown while steps are incomplete, dismissable */}
      {!hasAlerts && <DashboardOnboarding hasFiles={hasFiles} hasAlerts={hasAlerts} />}

      {/* Risk alert */}
      {kpis && kpis.pending_rev > 0 && (
        <Alert className="border-red-200 bg-red-50 dark:bg-red-950/30">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-700 dark:text-red-300">
            <strong>Risco financeiro:</strong> {formatCurrency(kpis.pending_rev)} em pagamentos com status <em>pending</em>. Verificar integração de gateway.
          </AlertDescription>
        </Alert>
      )}

      {/* Row 1: Primary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Receita Confirmada"
          value={kpisLoading ? "—" : formatCurrency(kpis?.revenue ?? 0)}
          sub={kpis ? `${formatNumber(kpis.paid_sessions)} sessões pagas` : undefined}
          icon={<DollarSign className="h-4 w-4" />}
          tooltip="Total de receita de sessões com pagamento aprovado no período selecionado."
          loading={kpisLoading}
          accent="blue"
        />
        <KPICard
          title="Energia Entregue"
          value={kpisLoading ? "—" : formatKwh(kpis?.energy_kwh ?? 0)}
          sub={kpis ? `R$ ${(kpis.rev_per_kwh ?? 0).toFixed(2)}/kWh médio` : undefined}
          icon={<Zap className="h-4 w-4" />}
          tooltip="Total de kWh carregados em todas as sessões do período. R$/kWh = receita ÷ energia total."
          loading={kpisLoading}
          accent="cyan"
        />
        <KPICard
          title="Ticket Médio"
          value={kpisLoading ? "—" : formatCurrency(kpis?.avg_ticket ?? 0)}
          sub={kpis ? `${formatNumber(kpis.sessions_per_day, 1)} sessões/dia` : undefined}
          icon={<Activity className="h-4 w-4" />}
          tooltip="Receita média por sessão paga. Sessões/dia = média de sessões por dia no período."
          loading={kpisLoading}
          accent="violet"
        />
        <KPICard
          title="Projeção Anual"
          value={kpisLoading ? "—" : formatCurrency(kpis?.proj_annual ?? 0)}
          sub={kpis ? `baseado em ${kpis.days} dias de dados` : undefined}
          icon={<TrendingUp className="h-4 w-4" />}
          tooltip="Extrapolação linear da receita confirmada atual para 365 dias, com base no ritmo do período analisado."
          loading={kpisLoading}
          accent="emerald"
        />
      </div>

      {/* Row 2: Secondary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Conversão"
          value={kpisLoading ? "—" : formatPct(kpis?.conversion ?? 0)}
          sub={kpis ? `${formatPct(kpis.approval ?? 0)} do total monetizado` : undefined}
          icon={<BarChart2 className="h-4 w-4" />}
          tooltip="% de sessões com tentativa de pagamento que foram efetivamente pagas e aprovadas pelo gateway."
          loading={kpisLoading}
          accent="emerald"
        />
        <KPICard
          title="Usuários Únicos"
          value={kpisLoading ? "—" : formatNumber(kpis?.unique_users ?? 0)}
          sub={kpis ? `${kpis.one_time} one-time · ${kpis.power_users} power users` : undefined}
          icon={<Users className="h-4 w-4" />}
          tooltip="Total de usuários distintos com ao menos uma sessão. One-time = apenas 1 sessão; Power users = 5 ou mais sessões."
          loading={kpisLoading}
          accent="blue"
        />
        <KPICard
          title="Power Users (5+)"
          value={kpisLoading ? "—" : formatNumber(kpis?.power_users ?? 0)}
          sub={kpis ? `${formatPct(kpis.power_rev_pct ?? 0)} da receita total` : undefined}
          icon={<Users className="h-4 w-4" />}
          tooltip="Usuários com 5 ou mais sessões no período. Normalmente representam a maior parcela da receita e são os mais fiéis à plataforma."
          loading={kpisLoading}
          accent="violet"
        />
        <KPICard
          title="Receita Pendente"
          value={kpisLoading ? "—" : formatCurrency(kpis?.pending_rev ?? 0)}
          sub="status pending — risco financeiro"
          icon={<AlertTriangle className="h-4 w-4" />}
          tooltip="Sessões com status 'pending' no gateway de pagamento — nem aprovadas nem reprovadas. Indica possível problema de integração."
          loading={kpisLoading}
          accent="red"
        />
      </div>

      {/* Row 3: Operational KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Receita / Dia"
          value={kpisLoading ? "—" : formatCurrency(kpis?.rev_per_day ?? 0)}
          sub={kpis ? `em ${kpis.days} dias analisados` : undefined}
          icon={<Clock className="h-4 w-4" />}
          tooltip="Média diária de receita confirmada no período analisado. Útil para comparar diferentes períodos com durações distintas."
          loading={kpisLoading}
          accent="blue"
        />
        <KPICard
          title="kWh / Dia"
          value={kpisLoading ? "—" : formatNumber(kpis?.kwh_per_day ?? 0, 1) + " kWh"}
          sub={kpis ? `${formatNumber(kpis.avg_kwh ?? 0, 1)} kWh por sessão média` : undefined}
          icon={<Zap className="h-4 w-4" />}
          tooltip="Média diária de energia entregue. kWh/sessão = média de energia por sessão individual no período."
          loading={kpisLoading}
          accent="cyan"
        />
        <KPICard
          title="Receita por Ociosidade"
          value={kpisLoading ? "—" : formatCurrency(kpis?.idle_rev ?? 0)}
          sub={kpis ? `${kpis.idle_sessions} sessões cobradas` : undefined}
          icon={<Clock className="h-4 w-4" />}
          tooltip="Receita gerada por tarifas de ociosidade — cobrada quando o veículo permanece conectado após a conclusão da carga."
          loading={kpisLoading}
          accent="amber"
        />
        <KPICard
          title="Taxa de Reprovação"
          value={kpisLoading ? "—" : formatPct(kpis?.rejection_rate ?? 0)}
          sub={kpis ? `${kpis.rejected_sessions} pagamentos não aprovados` : undefined}
          icon={<AlertTriangle className="h-4 w-4" />}
          tooltip="% de tentativas de pagamento reprovadas pelo gateway. Taxas altas podem indicar problemas no método de pagamento dos usuários."
          loading={kpisLoading}
          accent="red"
        />
      </div>

      {/* Charts row: Daily revenue + Hourly */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Receita Diária</CardTitle>
          </CardHeader>
          <CardContent>
            {tsLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : (
              <DownloadableChart filename="receita-diaria">
              <ResponsiveContainer width="100%" height={208}>
                <ComposedChart data={timeseriesWithMA} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: string) => {
                      const d = new Date(v);
                      return `${d.getDate()}/${d.getMonth() + 1}`;
                    }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `R$${v}`} width={56} />
                  <Tooltip
                    formatter={(v: number, name: string) => [
                      formatCurrency(v),
                      name === "ma7" ? "MM 7 dias" : "Receita",
                    ]}
                    labelFormatter={(l: string) => new Date(l).toLocaleDateString("pt-BR")}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} fill="url(#revGrad)" name="revenue" />
                  <Line type="monotone" dataKey="ma7" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="4 2" name="ma7" />
                </ComposedChart>
              </ResponsiveContainer>
              </DownloadableChart>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sessões por Hora</CardTitle>
          </CardHeader>
          <CardContent>
            {hourlyLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : (
              <DownloadableChart filename="sessoes-por-hora">
              <ResponsiveContainer width="100%" height={208}>
                <BarChart data={hourly ?? []} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${v}h`} />
                  <YAxis tick={{ fontSize: 10 }} width={32} />
                  <Tooltip
                    formatter={(v: number) => [formatNumber(v), "Sessões"]}
                    labelFormatter={(l: number) => `${l}:00`}
                  />
                  <Bar dataKey="sessions" fill="#2563eb" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              </DownloadableChart>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Funil de Conversão + Meios de Pagamento */}
      {(funnel.length > 0 || methodsForPie.length > 0) && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Funil */}
          {funnel.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Funil de Conversão</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 py-2">
                  {funnel.map((step, i) => {
                    const maxVal = funnel[0]?.value || 1;
                    const pct = (step.value / maxVal) * 100;
                    const funnelColors = ["#2563eb", "#10b981", "#f59e0b"];
                    return (
                      <div key={i} className="space-y-0.5">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{step.label}</span>
                          <span className="font-medium text-foreground">
                            {formatNumber(step.value)}
                            {i > 0 && funnel[i - 1]?.value
                              ? ` (${formatPct((step.value / funnel[i - 1].value) * 100)} do anterior)`
                              : ""}
                          </span>
                        </div>
                        <div className="flex justify-center">
                          <div
                            className="h-8 rounded transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: funnelColors[i] ?? "#6b7280",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Meios de Pagamento */}
          {methodsForPie.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Meios de Pagamento</CardTitle>
              </CardHeader>
              <CardContent>
                <DownloadableChart filename="meios-de-pagamento">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <Pie
                      data={methodsForPie}
                      dataKey="sessions"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={76}
                      paddingAngle={2}
                      label={({ name, percent }: { name: string; percent: number }) =>
                        `${name} ${(percent * 100).toFixed(0)}%`
                      }
                      labelLine={true}
                    >
                      {methodsForPie.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number, _: string, props: { payload?: { name?: string } }) => [
                        formatNumber(v) + " sessões",
                        props.payload?.name ?? "",
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                </DownloadableChart>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Payback CTA */}
      {hasData && (
        <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900">
          <CardContent className="pt-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Calculator className="h-8 w-8 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <p className="font-semibold text-sm">Análise de Investimento & Payback</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Simule o retorno do seu investimento com base nos dados reais de receita ({formatCurrency(kpis?.rev_per_day ?? 0)}/dia)
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/investimento"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0 border-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900")}
            >
              Calcular Payback
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Insights */}
      {insights && insights.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-base font-semibold">Insights & Oportunidades</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {(insights as Array<{ type: string; title: string; body: string; severity: string }>)
              .slice(0, 6)
              .map((ins, i) => (
                <Alert
                  key={i}
                  className={
                    ins.severity === "warning"
                      ? "border-amber-200 bg-amber-50 dark:bg-amber-950/30"
                      : ins.severity === "success"
                      ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30"
                      : "border-blue-200 bg-blue-50 dark:bg-blue-950/30"
                  }
                >
                  <AlertDescription>
                    <p className="font-medium text-sm">{ins.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{ins.body}</p>
                  </AlertDescription>
                </Alert>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
