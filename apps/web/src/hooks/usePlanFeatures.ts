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

function storageKey(userId: string) {
  return `plan_features_${userId}`;
}

function readCached(userId: string): PlanFeatures | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as PlanFeatures) : undefined;
  } catch {
    return undefined;
  }
}

function writeCached(userId: string, data: PlanFeatures) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(data));
  } catch {}
}

/**
 * Returns the current org's plan feature flags.
 *
 * Uses localStorage as fallbackData (keyed per user) so the sidebar never
 * flashes all-visible → restricted on page load. On the very first login
 * there's still a brief loading state, but subsequent loads are instant.
 *
 * `hasFeature(key)` returns:
 *   - `false` if user not loaded yet or request errored (fail-closed)
 *   - `true`  if the key doesn't exist in flags (backward-compat with old plans)
 *   - the stored boolean otherwise
 */
export function usePlanFeatures() {
  const { user } = useAuth();

  const fallbackData = user ? readCached(user.id) : undefined;

  const { data, isLoading, error } = useSWR<PlanFeatures>(
    user ? '/org/features' : null,
    fetcher,
    {
      revalidateOnFocus: true,
      dedupingInterval: 5_000,
      fallbackData,
      onSuccess: (d) => {
        if (user) writeCached(user.id, d);
      },
    }
  );

  function hasFeature(key: string): boolean {
    if (!user) return false;
    // During initial load without cached data, default to false (fail-closed).
    // With fallbackData from localStorage this branch is rarely hit after first login.
    if (isLoading && !fallbackData) return false;
    if (error || !data) return false;
    const flags = data.feature_flags;
    return key in flags ? flags[key] : true;
  }

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
