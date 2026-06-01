import useSWR from "swr";
import api from "@/lib/api";
import type { FilterParams } from "@/lib/types";

function buildParams(filters: FilterParams): Record<string, string | string[]> {
  const p: Record<string, string | string[]> = {};
  if (filters.date_from) p.date_from = filters.date_from;
  if (filters.date_to) p.date_to = filters.date_to;
  if (filters.files?.length) p.files = filters.files;
  if (filters.stations?.length) p.stations = filters.stations;
  if (filters.connectors?.length) p.connectors = filters.connectors;
  return p;
}

function makeKey(endpoint: string, filters: FilterParams, extra?: Record<string, unknown>) {
  return [endpoint, JSON.stringify(filters), extra ? JSON.stringify(extra) : ""];
}

async function fetcher([endpoint, filtersJson, extraJson]: [string, string, string]) {
  const filters = JSON.parse(filtersJson) as FilterParams;
  const extra = extraJson ? JSON.parse(extraJson) : {};
  const { data } = await api.get(endpoint, {
    params: { ...buildParams(filters), ...extra },
  });
  return data;
}

export function useKPIs(filters: FilterParams) {
  return useSWR(makeKey("/analytics/kpis", filters), fetcher);
}

export function useTimeseries(filters: FilterParams, granularity = "daily") {
  return useSWR(makeKey("/analytics/timeseries", filters, { granularity }), fetcher);
}

export function useHourly(filters: FilterParams) {
  return useSWR(makeKey("/analytics/hourly", filters), fetcher);
}

export function useStations(filters: FilterParams, top_n = 15, operating_hours = 24) {
  return useSWR(makeKey("/analytics/stations", filters, { top_n, operating_hours }), fetcher);
}

export function useUsers(filters: FilterParams) {
  return useSWR(makeKey("/analytics/users", filters), fetcher);
}

export function usePayments(filters: FilterParams) {
  return useSWR(makeKey("/analytics/payments", filters), fetcher);
}

export function useRevenueSources(filters: FilterParams) {
  return useSWR(makeKey("/analytics/revenue-sources", filters), fetcher);
}

export function useConnectors(filters: FilterParams) {
  return useSWR(makeKey("/analytics/connectors", filters), fetcher);
}

export function useWeekdays(filters: FilterParams) {
  return useSWR(makeKey("/analytics/weekdays", filters), fetcher);
}

export function useDRE(filters: FilterParams, granularity = "monthly", cost_config_id?: string) {
  return useSWR(makeKey("/analytics/dre", filters, { granularity, ...(cost_config_id ? { cost_config_id } : {}) }), fetcher);
}

export function useInsights(filters: FilterParams) {
  return useSWR(makeKey("/analytics/insights", filters), fetcher);
}

export function useUsersDeep(filters: FilterParams) {
  return useSWR(makeKey("/analytics/users-deep", filters), fetcher);
}

export function useSessionDuration(filters: FilterParams) {
  return useSWR(makeKey("/analytics/session-duration", filters), fetcher);
}

export function useStationDetail(stationName: string | null, filters: FilterParams) {
  return useSWR(
    stationName ? makeKey(`/analytics/stations/${encodeURIComponent(stationName)}/detail`, filters) : null,
    fetcher
  );
}

export function useUserDetail(userTag: string | null, filters: FilterParams) {
  return useSWR(
    userTag ? makeKey(`/analytics/users/${encodeURIComponent(userTag)}/detail`, filters) : null,
    fetcher
  );
}

export function useForecast(filters: FilterParams | null, horizon: number) {
  return useSWR(
    filters !== null ? makeKey("/analytics/forecast", filters, { horizon }) : null,
    fetcher
  );
}

export function useCohort(filters: FilterParams) {
  return useSWR(makeKey("/analytics/cohort", filters), fetcher);
}

export function useStationChurn(filters: FilterParams, threshold = 30) {
  return useSWR(makeKey("/analytics/stations/churn", filters, { threshold }), fetcher);
}

export function useHeatmap(filters: FilterParams) {
  return useSWR(makeKey("/analytics/heatmap", filters), fetcher);
}

async function simpleFetcher(url: string) {
  const { data } = await api.get(url);
  return data;
}

export function useUserNote(userTag: string | null) {
  return useSWR(
    userTag ? `/user-notes/${encodeURIComponent(userTag)}` : null,
    simpleFetcher
  );
}

export function useAuditLog(limit = 50) {
  return useSWR(`/audit?limit=${limit}`, simpleFetcher);
}
