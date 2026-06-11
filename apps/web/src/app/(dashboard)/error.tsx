"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Error boundary do grupo (dashboard). Captura exceções não tratadas em
 * qualquer página/segmento abaixo e mostra uma tela de recuperação em vez de
 * uma tela branca. `reset()` tenta re-renderizar o segmento que falhou.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log para diagnóstico (aparece no console do browser e em ferramentas de erro).
    console.error("[dashboard] erro não tratado:", error);
  }, [error]);

  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-red-50 p-4 dark:bg-red-950/40">
        <AlertTriangle className="h-8 w-8 text-red-500" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Algo deu errado</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Ocorreu um erro ao carregar esta página. Você pode tentar novamente —
          se persistir, atualize a página ou volte ao início.
        </p>
        {error?.digest && (
          <p className="pt-1 font-mono text-[0.65rem] text-muted-foreground/60">
            ref: {error.digest}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={reset} size="sm" className="gap-1.5">
          <RotateCw className="h-3.5 w-3.5" />
          Tentar novamente
        </Button>
        <Link
          href="/dashboard"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
