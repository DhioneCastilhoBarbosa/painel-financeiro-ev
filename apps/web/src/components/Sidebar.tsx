"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import {
  ChevronLeft, ChevronRight, LogOut, Moon, Sun, UserCircle, BookOpen, ShieldAlert,
} from "lucide-react";
import { NAV_GROUPS, type NavItem } from "@/lib/nav";
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

const ROLE_BADGE_STYLE: Record<string, React.CSSProperties> = {
  owner:   { background: "rgba(6,203,63,0.2)",  color: GREEN },
  admin:   { background: "rgba(6,203,63,0.12)", color: GREEN },
  analyst: { background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.8)" },
  viewer:  { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" },
};

export function Sidebar({
  className,
  mobile = false,
  onNavigate,
}: {
  className?: string;
  /** Variante para uso dentro do drawer mobile: largura cheia, sem botão de recolher. */
  mobile?: boolean;
  /** Chamado ao clicar em qualquer item de navegação (fecha o drawer no mobile). */
  onNavigate?: () => void;
} = {}) {
  const pathname  = usePathname();
  const [collapsedState, setCollapsed] = useState(false);
  const collapsed = mobile ? false : collapsedState;   // no mobile nunca recolhe
  const { user, logout } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  // next-themes só conhece o tema após montar no cliente — evita mismatch de hidratação.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";
  const toggleTheme = () => setTheme(isDark ? "light" : "dark");

  const { hasFeature, hasAnyFeature } = usePlanFeatures();

  const initials = user?.name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() ?? "?";

  const itemAllowed = ({ href, feature }: NavItem) => {
    if (!canAccess(user, href)) return false;
    if (!feature) return true;
    if (Array.isArray(feature)) return hasAnyFeature(...feature);
    return hasFeature(feature);
  };
  // Filtra itens por grupo e descarta grupos que ficaram vazios.
  const visibleGroups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter(itemAllowed) }))
    .filter((g) => g.items.length > 0);
  const showAdmin = isIntelbrasmaster(user);

  const renderItem = ({ href, label, icon: Icon }: NavItem) => {
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
        <Link key={href} href={href} onClick={onNavigate} className={cn(linkClass, !active && hoverClass)} style={linkStyle}>
          <Icon className="h-5 w-5 shrink-0" />
          <span className="truncate">{label}</span>
        </Link>
      );
    }
    return (
      <Tooltip key={href}>
        <TooltipTrigger
          render={<Link href={href} onClick={onNavigate} className={cn(linkClass, !active && hoverClass)} style={linkStyle} />}
        >
          <Icon className="h-5 w-5 shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider delay={0}>
      <aside
        data-sidebar
        className={cn(
          "relative flex flex-col border-r transition-all duration-200",
          mobile ? "w-full h-full" : collapsed ? "w-16" : "w-56",
          className
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
        <nav className="flex-1 py-3 overflow-y-auto">
          {visibleGroups.map((group, gi) => (
            <div key={group.label} className={cn(gi > 0 && "mt-3 pt-3", gi > 0 && "border-t")}
                 style={gi > 0 ? { borderColor: "rgba(255,255,255,0.08)" } : undefined}>
              {!collapsed && (
                <p className="px-5 pb-1 text-[0.6rem] font-semibold uppercase tracking-wider"
                   style={{ color: "rgba(255,255,255,0.35)" }}>
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map(renderItem)}
              </div>
            </div>
          ))}
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
                  onClick={onNavigate}
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

              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-sm rounded-lg hover:bg-white/10 transition-colors"
                style={{ color: "rgba(255,255,255,0.6)" }}
                title={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
                suppressHydrationWarning
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                <span suppressHydrationWarning>{isDark ? "Tema claro" : "Tema escuro"}</span>
              </button>

              {/* Profile */}
              <Link
                href="/dashboard/profile"
                onClick={onNavigate}
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
                      onClick={toggleTheme}
                      className="flex w-full items-center justify-center py-1.5 rounded-lg hover:bg-white/10 transition-colors"
                      style={{ color: "rgba(255,255,255,0.6)" }}
                      suppressHydrationWarning
                    />
                  }
                >
                  {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </TooltipTrigger>
                <TooltipContent side="right">{isDark ? "Tema claro" : "Tema escuro"}</TooltipContent>
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

        {/* ── Collapse toggle (apenas desktop) ──────────────────────────── */}
        {!mobile && (
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
        )}
      </aside>
    </TooltipProvider>
  );
}
