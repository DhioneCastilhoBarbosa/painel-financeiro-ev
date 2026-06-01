"use client";

import { useAuth } from "@/contexts/AuthContext";
import { canAccess } from "@/lib/permissions";
import { usePathname } from "next/navigation";
import { ShieldOff } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RoleGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  if (loading) return null;

  if (!canAccess(user, pathname)) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-24 text-center gap-4">
        <div className="rounded-full bg-red-50 dark:bg-red-950 p-4">
          <ShieldOff className="h-8 w-8 text-red-500" />
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-1">Acesso restrito</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Seu perfil não tem permissão para acessar esta página.
            Fale com um administrador da organização.
          </p>
        </div>
        <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Voltar ao início
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
