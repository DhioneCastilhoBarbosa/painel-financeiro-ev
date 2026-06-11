"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";

interface QueryStateProps {
  /** SWR `isLoading` (ou equivalente). */
  isLoading?: boolean;
  /** Erro retornado pelo SWR/fetch. Qualquer valor truthy ativa o estado de erro. */
  error?: unknown;
  /** Marca a ausência de dados (lista vazia, objeto nulo, etc.). */
  isEmpty?: boolean;
  /** Revalidar — normalmente o `mutate` do hook. Mostra "Tentar novamente". */
  onRetry?: () => void;

  /** Conteúdo a exibir quando há dados. */
  children: React.ReactNode;

  /** Skeleton custom durante o loading (padrão: blocos genéricos). */
  loadingFallback?: React.ReactNode;
  /** Empty state custom (padrão: <EmptyState />). */
  emptyFallback?: React.ReactNode;

  /** Altura mínima da área de estado, para evitar "pulo" de layout. */
  minHeight?: string;
}

function DefaultLoading() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

function ErrorState({ onRetry, minHeight }: { onRetry?: () => void; minHeight: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-12 text-center"
      style={{ minHeight }}
    >
      <div className="rounded-full bg-red-50 p-3 dark:bg-red-950/40">
        <AlertTriangle className="h-7 w-7 text-red-500" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold">Não foi possível carregar os dados</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Verifique sua conexão e tente novamente. Se o problema persistir, contate o suporte.
        </p>
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" className="gap-1.5" onClick={onRetry}>
          <RotateCw className="h-3.5 w-3.5" />
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

/**
 * Padroniza os três estados de uma query (loading / erro / vazio) e só renderiza
 * `children` quando há dados. Substitui os `if (isLoading) … if (error) …`
 * espalhados e inconsistentes pelas páginas.
 *
 * Ordem de precedência: erro → loading → vazio → children. (Erro primeiro para
 * que, com `keepPreviousData`, uma falha de revalidação seja sempre visível.)
 */
export function QueryState({
  isLoading,
  error,
  isEmpty,
  onRetry,
  children,
  loadingFallback,
  emptyFallback,
  minHeight = "200px",
}: QueryStateProps) {
  if (error) return <ErrorState onRetry={onRetry} minHeight={minHeight} />;
  if (isLoading) return <>{loadingFallback ?? <DefaultLoading />}</>;
  if (isEmpty) return <>{emptyFallback ?? <EmptyState />}</>;
  return <>{children}</>;
}
