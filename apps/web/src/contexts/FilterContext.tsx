"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import type { FilterParams } from "@/lib/types";

const STORAGE_KEY = "fd_filters_v1";

interface FilterContextValue {
  filters: FilterParams;
  setFilters: (f: FilterParams) => void;
  clearFilters: () => void;
}

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFiltersState] = useState<FilterParams>({});

  const setFilters = (f: FilterParams) => {
    setFiltersState(f);
    if (typeof window !== "undefined") {
      if (Object.keys(f).length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  };

  const clearFilters = () => {
    setFiltersState({});
    if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <FilterContext.Provider value={{ filters, setFilters, clearFilters }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilters must be used within FilterProvider");
  return ctx;
}
