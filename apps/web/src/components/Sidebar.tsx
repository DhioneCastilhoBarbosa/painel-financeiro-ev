"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import {
  BarChart3, FileSpreadsheet, TrendingUp, Zap, Settings,
  ChevronLeft, ChevronRight, LogOut, Users, Moon, Sun, FileText, Building2, UserCircle, CreditCard, Target, Wallet, BookOpen, ShieldAlert, MapPin,
} from "lucide-react";
import { Logo, LogoIcon } from "@/components/Logo";
import { useTheme } from "next-themes";
import { useAuth } from "@/contexts/AuthContext";
import { canAccess, isIntelbrasmaster, ROLE_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// ── Intelbras brand ────────────────────────────────────────────────────────────
const GREEN = "#06CB3F";   // Verde Institucional
const DARK  = "#163134";   // Verde Grandes Projetos

// `feature` = feature_flag key(s) required by plan. Array = any-of (OR).
// Items without `feature` are always shown if role allows.
const NAV: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; feature?: string | string[] }[] = [
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

const ROLE_BADGE_STYLE: Record<string, React.CSSProperties> = {
  owner:   { background: "rgba(6,203,63,0.2)",  color: GREEN },
  admin:   { background: "rgba(6,203,63,0.12)", color: GREEN },
  analyst: { background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.8)" },
  viewer:  { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" },
};

export function Sidebar() {
  const pathname  = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  const { hasFeature, hasAnyFeature } = usePlanFeatures();

  const initials = user?.name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() ?? "?";

  const visibleNav = NAV.filter(({ href, feature }) => {
    if (!canAccess(user, href)) return false;
    if (!feature) return true;
    if (Array.isArray(feature)) return hasAnyFeature(...feature);
    return hasFeature(feature);
  });
  const showAdmin = isIntelbrasmaster(user);

  return (
    <TooltipProvider delay={0}>
      <aside
        data-sidebar
        className={cn(
          "relative flex flex-col border-r transition-all duration-200",
          collapsed ? "w-16" : "w-56"
        )}
        style={{ backgroundColor: DARK, borderColor: "rgba(255,255,255,0.08)" }}
      >
        {/* ── Logo ─────────────────────────────────────────────────────── */}
        <div
          className={cn(
            "flex items-center px-4 py-5",
            collapsed ? "justify-center px-0" : "px-5"
          )}
          style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        >
          {collapsed ? <LogoIcon size={26} /> : <Logo height={26} />}
        </div>

        {/* ── Nav ──────────────────────────────────────────────────────── */}
        <nav className="flex-1 py-4 space-y-0.5 overflow-y-auto">
          {visibleNav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

            const linkClass = cn(
              "flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              collapsed && "justify-center px-0 mx-2"
            );

            const linkStyle: React.CSSProperties = active
              ? { backgroundColor: `${GREEN}1A`, color: GREEN }   /* 10% opacity tint */
              : { color: "rgba(255,255,255,0.7)" };

            const hoverClass = "hover:bg-white/10 hover:!text-white";

            if (!collapsed) {
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(linkClass, !active && hoverClass)}
                  style={linkStyle}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="truncate">{label}</span>
                </Link>
              );
            }

            return (
              <Tooltip key={href}>
                <TooltipTrigger
                  render={
                    <Link
                      href={href}
                      className={cn(linkClass, !active && hoverClass)}
                      style={linkStyle}
                    />
                  }
                >
                  <Icon className="h-5 w-5 shrink-0" />
                </TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {/* ── Bottom ───────────────────────────────────────────────────── */}
        <div
          className="p-3 space-y-2"
          style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
        >
          {!collapsed ? (
            <>
              {/* Painel Admin — apenas Administradores Intelbras */}
              {showAdmin && (
                <Link
                  href="/dashboard/admin"
                  className={cn(
                    "flex w-full items-center gap-2 px-2 py-1.5 text-sm rounded-lg transition-colors",
                    pathname.startsWith("/dashboard/admin")
                      ? "bg-amber-500/20 text-amber-400"
                      : "hover:bg-white/10 text-amber-400/80 hover:text-amber-300"
                  )}
                >
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  <span>Painel Admin</span>
                </Link>
              )}

              {/* Manual — apenas para Administradores Intelbras */}
              {user?.is_master && (
                <Link
                  href="/manual"
                  target="_blank"
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-sm rounded-lg transition-colors hover:bg-white/10"
                  style={{ color: "rgba(255,255,255,0.6)" }}
                >
                  <BookOpen className="h-4 w-4 shrink-0" />
                  <span>Manual</span>
                </Link>
              )}

              {/* Theme toggle (temporarily disabled) */}
              <button
                className="flex w-full items-center gap-2 px-2 py-1.5 text-sm rounded-lg opacity-40 cursor-not-allowed"
                style={{ color: "rgba(255,255,255,0.6)" }}
                disabled
                title="Alternância de tema temporariamente desativada"
              >
                {theme === "dark"
                  ? <Sun className="h-4 w-4" />
                  : <Moon className="h-4 w-4" />
                }
                <span>Tema</span>
              </button>

              {/* Profile */}
              <Link
                href="/dashboard/profile"
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/10 w-full transition-colors"
              >
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarFallback
                    className="text-xs font-semibold"
                    style={{ backgroundColor: `${GREEN}22`, color: GREEN }}
                  >
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate text-white">{user?.name}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span
                      className="text-[0.6rem] font-medium px-1.5 py-0 rounded-full"
                      style={ROLE_BADGE_STYLE[user?.role ?? "viewer"]}
                    >
                      {ROLE_LABELS[user?.role ?? "viewer"]}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => { e.preventDefault(); logout(); }}
                  title="Sair"
                  className="text-red-400 hover:text-red-300 hover:bg-white/10"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </>
          ) : (
            <>
              {user?.is_master && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Link
                        href="/manual"
                        target="_blank"
                        className="flex w-full items-center justify-center py-1.5 rounded-lg hover:bg-white/10 transition-colors"
                        style={{ color: "rgba(255,255,255,0.6)" }}
                      />
                    }
                  >
                    <BookOpen className="h-4 w-4" />
                  </TooltipTrigger>
                  <TooltipContent side="right">Manual do sistema</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      className="flex w-full items-center justify-center py-1.5 rounded-lg opacity-40 cursor-not-allowed"
                      style={{ color: "rgba(255,255,255,0.6)" }}
                      disabled
                    />
                  }
                >
                  {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </TooltipTrigger>
                <TooltipContent side="right">Alternância de tema temporariamente desativada</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Link
                      href="/dashboard/profile"
                      className="flex w-full items-center justify-center py-1.5 rounded-lg hover:bg-white/10 transition-colors"
                      style={{ color: "rgba(255,255,255,0.6)" }}
                    />
                  }
                >
                  <UserCircle className="h-4 w-4" />
                </TooltipTrigger>
                <TooltipContent side="right">Meu perfil</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      className="flex w-full items-center justify-center py-1.5 text-red-400 hover:text-red-300 rounded-lg hover:bg-white/10 transition-colors"
                      onClick={logout}
                    />
                  }
                >
                  <LogOut className="h-4 w-4" />
                </TooltipTrigger>
                <TooltipContent side="right">Sair</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>

        {/* ── Collapse toggle ───────────────────────────────────────────── */}
        <button
          className="absolute bottom-36 -right-3 h-6 w-6 rounded-full shadow-md flex items-center justify-center border transition-colors hover:opacity-90"
          style={{
            backgroundColor: DARK,
            borderColor: `${GREEN}40`,
            color: GREEN,
          }}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed
            ? <ChevronRight className="h-3 w-3" />
            : <ChevronLeft className="h-3 w-3" />
          }
        </button>
      </aside>
    </TooltipProvider>
  );
}
