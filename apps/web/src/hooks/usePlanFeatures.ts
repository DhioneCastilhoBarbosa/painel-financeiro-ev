'use client';
import useSWR from 'swr';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

export interface PlanFeatures {
  plan: string;
  plan_name: string;
  feature_flags: Record<string, boolean>;
}

const fetcher = (url: string) => api.get(url).then((r) => r.data);

/**
 * Returns the current org's plan feature flags.
 *
 * `hasFeature(key)` returns:
 *   - `true`  while the initial load is in progress (optimistic — evita flash de tela bloqueada)
 *   - `false` se o request falhou (fail-closed — não expõe features por erro de rede/API)
 *   - `true`  se a chave não existe nas flags (retrocompatibilidade com planos antigos)
 *   - o valor booleano armazenado caso contrário
 */
export function usePlanFeatures() {
  const { user } = useAuth();

  const { data, isLoading, error } = useSWR<PlanFeatures>(
    user ? '/org/features' : null,
    fetcher,
    {
      // Revalida ao focar a aba — garante que mudanças de plano feitas pelo
      // admin sejam visíveis rapidamente sem precisar de hard-refresh.
      revalidateOnFocus: true,
      dedupingInterval: 5_000,   // evita chamadas duplicadas em 5 s
    }
  );

  function hasFeature(key: string): boolean {
    if (isLoading) return true;   // otimista durante carregamento inicial
    if (error || !data) return false;  // fail-closed: erro na API bloqueia acesso
    const flags = data.feature_flags;
    // Se a chave não estiver nas flags (plano antigo), libera por retrocompatibilidade
    return key in flags ? flags[key] : true;
  }

  /** True if ANY of the given keys is enabled. */
  function hasAnyFeature(...keys: string[]): boolean {
    return keys.some((k) => hasFeature(k));
  }

  return {
    features: data?.feature_flags ?? {},
    hasFeature,
    hasAnyFeature,
    plan: data?.plan ?? '',
    planName: data?.plan_name ?? '',
    isLoading,
    error,
  };
}
