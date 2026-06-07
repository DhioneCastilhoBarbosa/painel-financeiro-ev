import type { User, Permission } from "@/lib/types";

type Role = User["role"];

// Which roles can access each route (built-in roles only)
// Routes not listed here are unrestricted for authenticated users.
export const ROUTE_PERMISSIONS: Record<string, Role[]> = {
  "/dashboard":              ["owner", "admin", "analyst", "viewer"],
  "/dashboard/timeseries":   ["owner", "admin", "analyst"],
  "/dashboard/stations":     ["owner", "admin", "analyst"],
  "/dashboard/usuarios":     ["owner", "admin", "analyst"],
  "/dashboard/dre":          ["owner", "admin", "analyst"],
  "/dashboard/cohort":       ["owner", "admin", "analyst"],
  "/dashboard/investimento":  ["owner", "admin", "analyst"],
  "/dashboard/relatorio":    ["owner", "admin", "analyst", "viewer"],
  "/dashboard/files":        ["owner", "admin"],
  "/dashboard/team":         ["owner", "admin"],
  "/dashboard/settings":     ["owner", "admin"],
  "/dashboard/billing":      ["owner"],
  "/dashboard/map":          ["owner", "admin", "analyst"],
  "/dashboard/capex":        ["owner", "admin", "analyst"],
  "/dashboard/profile":      ["owner", "admin", "analyst", "viewer"],
  // /dashboard/leads is intentionally absent from the role list —
  // access is granted via view_leads / manage_leads permission below.
};

export const ROLE_LABELS: Record<Role, string> = {
  owner:   "Proprietário",
  admin:   "Administrador",
  analyst: "Analista",
  viewer:  "Visualizador",
};

/** Returns true if the user has the given granular permission set to true. */
export function hasPermission(user: User | null, perm: Permission): boolean {
  if (!user) return false;
  // owner and admin always have all permissions
  if (user.role === "owner" || user.role === "admin") return true;
  return !!user.permissions?.[perm];
}

/** User can see the Leads CRM (list + detail + export). */
export function canViewLeads(user: User | null): boolean {
  if (!user) return false;
  if (user.role === "owner" || user.role === "admin") return true;
  // manage_leads implies view_leads
  return hasPermission(user, "view_leads") || hasPermission(user, "manage_leads");
}

/** User can access lead configurations (simulator config, notification emails). */
export function canManageLeads(user: User | null): boolean {
  return hasPermission(user, "manage_leads");
}

/** Returns true if the user is an Intelbras master (access to admin panel). */
export function isIntelbrasmaster(user: User | null): boolean {
  return !!user && user.is_master && user.organization_is_mother === true;
}

export function canAccess(user: User | null, route: string): boolean {
  if (!user) return false;

  // Admin panel: only Intelbras masters
  if (route === "/dashboard/admin") return isIntelbrasmaster(user);

  // Leads route: governed by permissions, not built-in role
  if (route === "/dashboard/leads") return canViewLeads(user);

  const allowed = ROUTE_PERMISSIONS[route];
  if (!allowed) return true; // unlisted routes are unrestricted
  return allowed.includes(user.role);
}

// Can upload/delete files, manage team, change settings
export function canManage(user: User | null): boolean {
  return !!user && (user.role === "owner" || user.role === "admin");
}

// Can view analytics pages (everything except admin-only)
export function canAnalyze(user: User | null): boolean {
  return !!user && user.role !== "viewer";
}
