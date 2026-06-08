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
 *   - `true`  while still loading (optimistic — avoids flashing locked states)
 *   - `true`  if the key is missing from the flags (backward-compat with old plans)
 *   - the stored boolean otherwise
 */
export function usePlanFeatures() {
  const { user } = useAuth();

  const { data, isLoading, error } = useSWR<PlanFeatures>(
    user ? '/organizations/features' : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

  function hasFeature(key: string): boolean {
    if (isLoading || !data) return true;
    const flags = data.feature_flags;
    // If key not present at all (old plan config), default to true
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
