"use client";

import { PlanGate } from "@/components/PlanGate";
import { useState } from "react";
import { Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { exportToCSV } from "@/lib/exportCSV";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterBar } from "@/components/FilterBar";
import { useFilters } from "@/contexts/FilterContext";
import { useDRE } from "@/hooks/useAnalytics";
import { formatCurrency, formatPct } from "@/lib/format";
import { DownloadableChart } from "@/components/DownloadableChart";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

interface DRERow {
  period: string;
  period_start: string;
  sessions: number;
  kwh: number;
  gross_revenue: number;
  voucher_discount: number;
  net_revenue: number;
  energy_cost: number;
  operational_cost: number;
  platform_fee: number;
  platform_fixed: number;
  tax: number;
  revenue_split: number;
  maintenance: number;
  total_costs: number;
  ebitda: number;
  ebitda_margin_pct: number;
  ebit: number;
  net_margin_pct: number;
}

// Extended DRE row with client-side computed fields
interface DRERowExtended extends DRERow {
  lucro_bruto: number;
  opex_total: number;
  ebit_margin_pct: number;
  net_income: number;
  net_margin_pct_display: number;
  depreciation: number;
}

function extendRow(r: DRERow): DRERowExtended {
  const lucro_bruto = r.net_revenue - r.energy_cost;
  const opex_total = r.total_costs - r.energy_cost - r.tax;
  const ebit_margin_pct = r.net_revenue > 0 ? (r.ebit / r.net_revenue) * 100 : 0;
  const net_income = r.ebit - r.tax;
  const net_margin_pct_display = r.net_revenue > 0 ? (net_income / r.net_revenue) * 100 : 0;
  return {
    ...r,
    lucro_bruto,
    opex_total,
    ebit_margin_pct,
    net_income,
    net_margin_pct_display,
    depreciation: 0,
  };
}

export default function DREPage() {
  return (
    <PlanGate feature="dre">
      <DREPageContent />
    </PlanGate>
  );
}

function DREPageContent() {
  const { filters } = useFilters();
  const [granularity, setGranularity] = useState<"weekly" | "monthly" | "quarterly">("monthly");
  const { data: dre, isLoading } = useDRE(filters, granularity);

  const rawRows: DRERow[] = dre ?? [];
  const rows: DRERowExtended[] = rawRows.map(extendRow);

  const totals = rows.reduce(
    (acc, r) => ({
      revenue: acc.revenue + (r.net_revenue ?? 0),
      gross_revenue: acc.gross_revenue + (r.gross_revenue ?? 0),
      ebitda: acc.ebitda + (r.ebitda ?? 0),
      net_income: acc.net_income + (r.net_income ?? 0),
      ebit: acc.ebit + (r.ebit ?? 0),
      total_costs: acc.total_costs + (r.total_costs ?? 0),
      energy_cost: acc.energy_cost + (r.energy_cost ?? 0),
      sessions: acc.sessions + (r.sessions ?? 0),
    }),
    { revenue: 0, gross_revenue: 0, ebitda: 0, net_income: 0, ebit: 0, total_costs: 0, energy_cost: 0, sessions: 0 }
  );

  const grossProfit = totals.revenue - totals.energy_cost;

  const periodsPerYear = granularity === "weekly" ? 52 : granularity === "quarterly" ? 4 : 12;
  const daysPerPeriod = granularity === "weekly" ? 7 : granularity === "quarterly" ? 91 : 30;
  const totalDays = Math.max(rows.length * daysPerPeriod, 1);
  const profitPerDay = totals.net_income / totalDays;

  const avgMargin = rows.length > 0
    ? rows.reduce((a, r) => a + (r.net_margin_pct_display ?? 0), 0) / rows.length
    : 0;

  const avgNetIncome = rows.length > 0
    ? rows.reduce((a, r) => a + (r.net_income ?? 0), 0) / rows.length
    : 0;
  const annualizedNetIncome = avgNetIncome * periodsPerYear;

  const avgNetRevenue = rows.length > 0
    ? rows.reduce((a, r) => a + (r.net_revenue ?? 0), 0) / rows.length
    : 0;
  const annualizedNetRevenue = avgNetRevenue * periodsPerYear;

  // Table row definitions
  type RowDef =
    | { kind: "data"; key: keyof DRERowExtended; label: string; style: "green" | "red" | "green-bold" | "red-bold" | "blue-italic" }
    | { kind: "computed"; fn: (r: DRERowExtended) => number; label: string; style: "green" | "red" | "green-bold" | "red-bold" | "blue-italic"; format?: "currency" | "pct" }
    | { kind: "conditional"; key: keyof DRERowExtended; label: string; style: "green" | "red" | "green-bold" | "red-bold" | "blue-italic"; showIfNonZero?: keyof DRERowExtended };

  const tableRows: RowDef[] = [
    { kind: "data", key: "gross_revenue",    label: "ROB — Receita Operacional Bruta",    style: "green" },
    { kind: "data", key: "voucher_discount", label: "(−) Descontos/Vouchers",              style: "red" },
    { kind: "data", key: "net_revenue",      label: "ROL — Receita Operacional Líquida",  style: "green" },
    { kind: "data", key: "energy_cost",      label: "(−) Custo de Energia",               style: "red" },
    { kind: "data", key: "lucro_bruto",      label: "(=) LUCRO BRUTO",                    style: "green-bold" },
    { kind: "computed", fn: (r) => r.net_revenue > 0 ? r.lucro_bruto / r.net_revenue * 100 : 0,
      label: "    Margem Bruta", style: "blue-italic", format: "pct" },
    { kind: "data", key: "platform_fee",     label: "(−) Taxa plataforma (%)",            style: "red" },
    { kind: "data", key: "operational_cost", label: "(−) Custo operacional (%)",          style: "red" },
    { kind: "data", key: "platform_fixed",   label: "(−) Fee plataforma (fixo)",          style: "red" },
    { kind: "data", key: "revenue_split",    label: "(−) Revenue Split",                  style: "red" },
    { kind: "data", key: "maintenance",      label: "(−) Manutenção",                     style: "red" },
    { kind: "data", key: "opex_total",       label: "Total de Custos Operacionais",       style: "red-bold" },
    { kind: "data", key: "ebitda",           label: "EBITDA",                             style: "green-bold" },
    { kind: "data", key: "ebitda_margin_pct",label: "    Margem EBITDA",                  style: "blue-italic" },
    { kind: "data", key: "depreciation",     label: "(−) Depreciação",                    style: "red" },
    { kind: "data", key: "ebit",             label: "EBIT",                               style: "green-bold" },
    { kind: "computed", fn: (r) => r.ebit_margin_pct,
      label: "    Margem EBIT", style: "blue-italic", format: "pct" },
    { kind: "data", key: "tax",              label: "(−) Impostos (Simples s/ ROL)",      style: "red" },
    { kind: "data", key: "net_income",       label: "Lucro Líquido",                      style: "green-bold" },
    { kind: "computed", fn: (r) => r.net_margin_pct_display,
      label: "    Margem Lucro Líquido", style: "blue-italic", format: "pct" },
    { kind: "computed", fn: (r) => r.net_income * periodsPerYear,
      label: "(=) Lucro Líquido Anualizado (proj.)", style: "green-bold", format: "currency" },
  ];

  function cellClass(style: RowDef["style"]) {
    switch (style) {
      case "green":      return "text-emerald-600 dark:text-emerald-400 font-semibold";
      case "red":        return "text-red-500 dark:text-red-400";
      case "green-bold": return "text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40";
      case "red-bold":   return "text-red-600 dark:text-red-400 font-bold";
      case "blue-italic":return "text-blue-600 dark:text-blue-400 text-[0.7rem] italic pl-6";
    }
  }

  function rowBg(style: RowDef["style"]) {
    if (style === "green-bold") return "bg-emerald-50 dark:bg-emerald-950/40";
    return "";
  }

  function getValue(row: RowDef, r: DRERowExtended): number {
    if (row.kind === "computed") return row.fn(r);
    return (r[row.key] as number) ?? 0;
  }

  function formatValue(row: RowDef, v: number): string {
    if (row.kind === "computed" && row.format === "pct") return formatPct(v);
    if (row.kind === "data" && (row.key === "ebitda_margin_pct")) return formatPct(v);
    return formatCurrency(v);
  }

  if (!isLoading && rows.length === 0) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">DRE — Demonstração de Resultado</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Receita, custos e margens por período</p>
          </div>
          <FilterBar />
        </div>
        <EmptyState
          title="Nenhum dado financeiro disponível"
          description="Importe um arquivo Excel para gerar a Demonstração de Resultado com receitas, custos e margens."
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
          <h1 className="text-2xl font-bold">DRE — Demonstração de Resultado</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Receita, custos e margens por período</p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={granularity} onValueChange={(v) => setGranularity(v as typeof granularity)}>
            <TabsList className="h-8">
              <TabsTrigger value="weekly" className="text-xs px-3">Semanal</TabsTrigger>
              <TabsTrigger value="monthly" className="text-xs px-3">Mensal</TabsTrigger>
              <TabsTrigger value="quarterly" className="text-xs px-3">Trimestral</TabsTrigger>
            </TabsList>
          </Tabs>
          <FilterBar />
        </div>
      </div>

      {/* Summary cards — row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: "ROL — Receita Líquida", value: formatCurrency(totals.revenue), color: "text-blue-600 dark:text-blue-400", border: "border-l-blue-500" },
          { label: "EBITDA Total", value: formatCurrency(totals.ebitda), color: "text-emerald-600 dark:text-emerald-400", border: "border-l-emerald-500" },
          { label: "Margem Líquida Média", value: formatPct(avgMargin), color: avgMargin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400", border: avgMargin >= 0 ? "border-l-emerald-500" : "border-l-red-500" },
        ].map(({ label, value, color, border }) => (
          <Card key={label} className={`border-l-4 ${border}`}>
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Summary cards — row 1b: annualized projections */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: "Receita Anualizada (proj.)", value: formatCurrency(annualizedNetRevenue), color: "text-blue-600 dark:text-blue-400", border: "border-l-blue-500", sub: `média de ${formatCurrency(avgNetRevenue)}/período` },
          { label: "Lucro Anualizado (proj.)", value: formatCurrency(annualizedNetIncome), color: annualizedNetIncome >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400", border: annualizedNetIncome >= 0 ? "border-l-emerald-500" : "border-l-red-500", sub: `média de ${formatCurrency(avgNetIncome)}/período` },
        ].map(({ label, value, color, border, sub }) => (
          <Card key={label} className={`border-l-4 ${border}`}>
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Summary cards — row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: "Custo Total", value: formatCurrency(totals.total_costs), color: "text-red-500 dark:text-red-400", border: "border-l-red-500", sub: `${formatPct(totals.revenue > 0 ? totals.total_costs / totals.revenue * 100 : 0)} da receita` },
          { label: "Lucro Bruto", value: formatCurrency(grossProfit), color: grossProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400", border: grossProfit >= 0 ? "border-l-emerald-500" : "border-l-red-500", sub: "ROL – Custo Energia" },
          { label: "Lucro / Dia", value: formatCurrency(profitPerDay), color: profitPerDay >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400", border: profitPerDay >= 0 ? "border-l-emerald-500" : "border-l-red-500", sub: `base ${totalDays} dias` },
        ].map(({ label, value, color, border, sub }) => (
          <Card key={label} className={`border-l-4 ${border}`}>
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
              {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Stacked cost chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Receita vs. Custos por Período</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <DownloadableChart filename="dre-receita-custos">
            <ResponsiveContainer width="100%" height={288}>
              <ComposedChart data={rows} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `R$${v.toFixed(0)}`} width={64} />
                <Tooltip formatter={(v: number, name: string) => {
                  const labels: Record<string, string> = {
                    energy_cost: "Energia", operational_cost: "Operacional",
                    platform_fee: "Plataforma", tax: "Impostos",
                    maintenance: "Manutenção", net_income: "Lucro Líquido",
                  };
                  return [formatCurrency(v), labels[name] ?? name];
                }} />
                <Legend formatter={(v: string) => ({
                  energy_cost: "Energia", operational_cost: "Operacional",
                  platform_fee: "Plataforma", tax: "Impostos",
                  maintenance: "Manutenção", net_income: "Lucro Líquido",
                }[v] ?? v)} />
                <Bar dataKey="energy_cost" stackId="costs" fill="#ef4444" name="energy_cost" />
                <Bar dataKey="operational_cost" stackId="costs" fill="#f97316" name="operational_cost" />
                <Bar dataKey="platform_fee" stackId="costs" fill="#f59e0b" name="platform_fee" />
                <Bar dataKey="tax" stackId="costs" fill="#8b5cf6" name="tax" />
                <Bar dataKey="maintenance" stackId="costs" fill="#06b6d4" name="maintenance" radius={[2, 2, 0, 0]} />
                <Line type="monotone" dataKey="net_income" stroke="#10b981" strokeWidth={2.5} dot={false} name="net_income" />
              </ComposedChart>
            </ResponsiveContainer>
            </DownloadableChart>
          )}
        </CardContent>
      </Card>

      {/* Margin chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Evolução das Margens</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <DownloadableChart filename="dre-margens">
            <ResponsiveContainer width="100%" height={208}>
              <ComposedChart data={rows} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v.toFixed(0)}%`} width={48} />
                <Tooltip formatter={(v: number, name: string) => [
                  formatPct(v),
                  name === "ebitda_margin_pct" ? "Margem EBITDA" : "Margem Líquida",
                ]} />
                <Legend formatter={(v: string) => v === "ebitda_margin_pct" ? "Margem EBITDA" : "Margem Líquida"} />
                <Line type="monotone" dataKey="ebitda_margin_pct" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="net_margin_pct_display" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="5 5" />
              </ComposedChart>
            </ResponsiveContainer>
            </DownloadableChart>
          )}
        </CardContent>
      </Card>

      {/* DRE Table — full breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">DRE Completa por Período</CardTitle>
            {rows.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => exportToCSV(
                  rows.map(r => ({
                    periodo: r.period,
                    receita_bruta: r.gross_revenue,
                    desconto_voucher: r.voucher_discount,
                    receita_liquida: r.net_revenue,
                    custo_energia: r.energy_cost,
                    lucro_bruto: r.lucro_bruto,
                    taxa_plataforma: r.platform_fee,
                    custo_operacional: r.operational_cost,
                    fee_fixo: r.platform_fixed,
                    revenue_split: r.revenue_split,
                    manutencao: r.maintenance,
                    ebitda: r.ebitda,
                    margem_ebitda_pct: r.ebitda_margin_pct,
                    ebit: r.ebit,
                    imposto: r.tax,
                    lucro_liquido: r.net_income,
                    margem_liquida_pct: r.net_margin_pct_display,
                  })),
                  `dre-${granularity}`
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
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-2 pr-4 font-medium min-w-[200px]">Linha DRE</th>
                    {rows.map((r) => (
                      <th key={r.period} className="text-right py-2 px-2 font-medium whitespace-nowrap">{r.period}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {tableRows.map((rowDef, ri) => (
                    <tr
                      key={ri}
                      className={`border-b hover:bg-slate-50 dark:hover:bg-slate-800 ${rowBg(rowDef.style)}`}
                    >
                      <td className={`py-1.5 pr-4 ${cellClass(rowDef.style)}`}>
                        {rowDef.label}
                      </td>
                      {rows.map((r) => {
                        const val = getValue(rowDef, r);
                        return (
                          <td
                            key={r.period}
                            className={`text-right py-1.5 px-2 tabular-nums ${cellClass(rowDef.style)}`}
                          >
                            {formatValue(rowDef, val)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
