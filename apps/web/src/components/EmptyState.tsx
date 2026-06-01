"use client";

import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  title = "Sem dados disponíveis",
  description = "Importe um arquivo Excel para visualizar as análises.",
  actionLabel = "Importar arquivo",
  actionHref = "/dashboard/files",
  icon,
  className = "",
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 text-center ${className}`}>
      <div className="rounded-full bg-slate-100 dark:bg-slate-800 p-4 mb-4">
        {icon ?? <FileSpreadsheet className="h-8 w-8 text-slate-400" />}
      </div>
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground mb-5 max-w-xs leading-relaxed">{description}</p>
      {actionHref && actionLabel && (
        <Link href={actionHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
