import { useAuth } from "@/contexts/AuthContext";
import type { Permission } from "@/lib/types";

/**
 * Retorna true se o usuário tem a permissão solicitada.
 * owner e admin sempre retornam true.
 */
export function usePermission(permission: Permission): boolean {
  const { user } = useAuth();
  if (!user) return false;
  if (user.role === "owner" || user.role === "admin") return true;
  return user.permissions?.[permission] ?? false;
}

/**
 * Retorna um objeto com todas as permissões do usuário.
 */
export function usePermissions(): Record<Permission, boolean> {
  const { user } = useAuth();
  if (!user) {
    return {} as Record<Permission, boolean>;
  }
  if (user.role === "owner" || user.role === "admin") {
    const all: Permission[] = [
      "view_dashboard", "view_stations", "view_users", "view_investment",
      "import_files", "delete_files", "manage_alerts", "manage_settings",
      "manage_team", "view_billing", "view_audit",
    ];
    return Object.fromEntries(all.map((p) => [p, true])) as Record<Permission, boolean>;
  }
  return user.permissions ?? ({} as Record<Permission, boolean>);
}
