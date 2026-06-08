import type { ComponentType } from "react";
import {
  BarChart3, FileSpreadsheet, TrendingUp, Zap, Settings,
  Users, FileText, Building2, CreditCard, Target, Wallet, MapPin,
} from "lucide-react";
import type { User } from "@/lib/types";
import { canAccess } from "@/lib/permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Feature flag key(s) required by plan. Array = any-of (OR). */
  feature?: string | string[];
}

// Ordem canônica da sidebar. Também define a prioridade usada para escolher a
// primeira tela acessível ao logar (firstAccessibleRoute).
// Items sem `feature` são sempre exibidos se o cargo (role) permitir.
export const NAV: NavItem[] = [
  { href: "/dashboard",              label: "Visão Geral",          icon: BarChart3,       feature: "dashboard_overview" },
  { href: "/dashboard/timeseries",   label: "Receita",              icon: TrendingUp,      feature: "revenue" },
  { href: "/dashboard/stations",     label: "Estações",             icon: Zap,             feature: "stations" },
  { href: "/dashboard/usuarios",     label: "Usuários",             icon: Users,           feature: "users_analytics" },
  { href: "/dashboard/dre",          label: "DRE",                  icon: BarChart3,       feature: "dre" },
  // Investment shown if simple OR advanced is enabled
  { href: "/dashboard/investimento", label: "Análise de Invest.",   icon: Building2,       feature: ["investment_simple", "investment_advanced"] },
  { href: "/dashboard/map",          label: "Mapa de Instalação",   icon: MapPin,          feature: "map_view" },
  { href: "/dashboard/capex",        label: "CAPEX por Carregador", icon: Wallet,          feature: "capex" },
  { href: "/dashboard/relatorio",    label: "Relatório PDF",        icon: FileText,        feature: "pdf_report" },
  { href: "/dashboard/files",        label: "Arquivos",             icon: FileSpreadsheet, feature: "files" },
  { href: "/dashboard/leads",        label: "Leads",                icon: Target,          feature: "leads" },
  { href: "/dashboard/team",         label: "Equipe",               icon: Users,           feature: "team" },
  { href: "/dashboard/billing",      label: "Plano & Cobrança",     icon: CreditCard,      feature: "billing" },
  { href: "/dashboard/settings",     label: "Configurações",        icon: Settings,        feature: "settings" },
];

/**
 * Retorna o href da primeira tela acessível ao usuário, respeitando tanto o
 * cargo (canAccess) quanto as feature flags do plano. Usado para redirecionar
 * o usuário ao logar quando a Visão Geral não está habilitada para seu plano.
 *
 * Fallback: /dashboard/profile (sempre acessível a qualquer usuário autenticado).
 */
export function firstAccessibleRoute(
  user: User | null,
  hasFeature: (key: string) => boolean,
  hasAnyFeature: (...keys: string[]) => boolean,
): string {
  for (const item of NAV) {
    if (!canAccess(user, item.href)) continue;
    if (!item.feature) return item.href;
    const ok = Array.isArray(item.feature)
      ? hasAnyFeature(...item.feature)
      : hasFeature(item.feature);
    if (ok) return item.href;
  }
  return "/dashboard/profile";
}
