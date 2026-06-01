"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useFilters } from "@/contexts/FilterContext";
import type { FilterParams } from "@/lib/types";

const STORAGE_KEY = "fd_filters_v1";

function paramsToFilters(params: URLSearchParams): FilterParams {
  const f: FilterParams = {};
  const df = params.get("date_from");
  const dt = params.get("date_to");
  if (df) f.date_from = df;
  if (dt) f.date_to = dt;
  const stations = params.getAll("stations");
  if (stations.length) f.stations = stations;
  const connectors = params.getAll("connectors");
  if (connectors.length) f.connectors = connectors;
  const files = params.getAll("files");
  if (files.length) f.files = files;
  return f;
}

function filtersToSearch(f: FilterParams): string {
  const p = new URLSearchParams();
  if (f.date_from) p.set("date_from", f.date_from);
  if (f.date_to) p.set("date_to", f.date_to);
  (f.stations ?? []).forEach((s) => p.append("stations", s));
  (f.connectors ?? []).forEach((c) => p.append("connectors", c));
  (f.files ?? []).forEach((id) => p.append("files", id));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function FilterURLSync() {
  const { filters, setFilters } = useFilters();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // Tracks whether the initialization effect has already run
  const initialized = useRef(false);

  // On mount: URL params take priority, then fall back to localStorage
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const urlFilters = paramsToFilters(new URLSearchParams(searchParams.toString()));
    if (Object.keys(urlFilters).length > 0) {
      setFilters(urlFilters);
      return;
    }

    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as FilterParams;
      if (Object.keys(stored).length > 0) setFilters(stored);
    } catch {
      // ignore malformed localStorage
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When filters change (after init): sync to URL
  useEffect(() => {
    if (!initialized.current) return;
    const search = filtersToSearch(filters);
    if (search !== window.location.search) {
      router.replace(pathname + search, { scroll: false });
    }
  }, [filters, pathname, router]);

  return null;
}
