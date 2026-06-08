'use client';
import { Lock } from 'lucide-react';
import { usePlanFeatures } from '@/hooks/usePlanFeatures';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface Props {
  /** Feature key(s). If multiple, access granted when ANY is true. */
  feature: string | string[];
  children: React.ReactNode;
  /** What to render when access is denied. Defaults to a full-page upgrade prompt. */
  fallback?: React.ReactNode;
}

function UpgradePrompt({ planName }: { planName: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-4 p-8 text-center">
      <div className="h-14 w-14 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center">
        <Lock className="h-7 w-7 text-amber-500" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold">Funcionalidade não disponível</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          Esta funcionalidade não está incluída no plano{' '}
          <span className="font-medium">{planName || 'atual'}</span>.
          Faça upgrade para desbloqueá-la.
        </p>
      </div>
      <Button asChild size="sm" className="gap-1.5">
        <Link href="/dashboard/billing">Ver planos disponíveis</Link>
      </Button>
    </div>
  );
}

/**
 * Renders `children` only if the current org's plan has the required feature(s).
 * Shows an upgrade prompt (or custom `fallback`) otherwise.
 * While loading, renders children optimistically.
 */
export function PlanGate({ feature, children, fallback }: Props) {
  const { hasFeature, hasAnyFeature, planName, isLoading } = usePlanFeatures();

  if (isLoading) return <>{children}</>;

  const keys = Array.isArray(feature) ? feature : [feature];
  const allowed = keys.length === 1 ? hasFeature(keys[0]) : hasAnyFeature(...keys);

  if (!allowed) {
    return <>{fallback ?? <UpgradePrompt planName={planName} />}</>;
  }

  return <>{children}</>;
}
