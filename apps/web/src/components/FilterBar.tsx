"use client";

import { useState, useEffect } from "react";
import { CalendarIcon, X, SlidersHorizontal, Bookmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useFilters } from "@/contexts/FilterContext";
import api from "@/lib/api";
import type { DataFile, FilterParams } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PRESETS_KEY = "fd_presets_v1";

interface FilterPreset {
  id: string;
  name: string;
  filters: FilterParams;
}

function loadPresets(): FilterPreset[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? "[]") as FilterPreset[];
  } catch {
    return [];
  }
}

function persistPresets(presets: FilterPreset[]) {
  if (typeof window !== "undefined") localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

export function FilterBar() {
  const { filters, setFilters, clearFilters } = useFilters();
  const [files, setFiles] = useState<DataFile[]>([]);
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState(filters);
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  useEffect(() => { setPresets(loadPresets()); }, []);

  useEffect(() => {
    api.get<DataFile[]>("/files").then((r) => {
      setFiles(r.data.filter((f) => f.status === "done"));
    }).catch(() => {});
  }, []);

  const activeCount = Object.values(filters).filter((v) =>
    Array.isArray(v) ? v.length > 0 : Boolean(v)
  ).length;

  const apply = () => {
    if (local.date_from && local.date_to && local.date_from > local.date_to) {
      setDateError("A data inicial deve ser anterior à data final.");
      return;
    }
    setDateError(null);
    setFilters(local);
    setOpen(false);
  };

  const clear = () => { setDateError(null); setLocal({}); clearFilters(); setOpen(false); };

  const savePreset = () => {
    if (!presetName.trim()) return;
    const next = [...presets, { id: Date.now().toString(), name: presetName.trim(), filters: local }];
    setPresets(next);
    persistPresets(next);
    setPresetName("");
    setShowSavePreset(false);
  };

  const loadPreset = (preset: FilterPreset) => {
    setLocal(preset.filters);
    setFilters(preset.filters);
    setOpen(false);
  };

  const deletePreset = (id: string) => {
    const next = presets.filter((p) => p.id !== id);
    setPresets(next);
    persistPresets(next);
  };

  const allStations = Array.from(new Set(files.flatMap((f) => f.stations)));
  const allConnectors = Array.from(new Set(files.flatMap((f) => f.connector_types)));

  const toggleArr = (key: "files" | "stations" | "connectors", val: string) => {
    const cur = (local[key] as string[]) ?? [];
    setLocal({ ...local, [key]: cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val] });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")} />
          }
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtros
          {activeCount > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">{activeCount}</Badge>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-80 p-4 space-y-4" align="end">
          <p className="font-semibold text-sm">Filtros</p>

          {/* Saved presets */}
          {presets.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Presets salvos</Label>
              <div className="flex flex-wrap gap-1.5">
                {presets.map((p) => (
                  <div key={p.id} className="flex items-center rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-2 pr-0.5 py-0.5 gap-0.5">
                    <button
                      className="text-xs text-blue-600 hover:text-blue-800"
                      onClick={() => loadPreset(p)}
                    >
                      {p.name}
                    </button>
                    <button
                      className="ml-1 text-slate-500 dark:text-slate-400 hover:text-red-500"
                      onClick={() => deletePreset(p.id)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Date range */}
          <div className="space-y-1">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">De</Label>
                <Input
                  type="date"
                  value={local.date_from ?? ""}
                  onChange={(e) => { setDateError(null); setLocal({ ...local, date_from: e.target.value || undefined }); }}
                  className={`h-8 text-xs ${dateError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Até</Label>
                <Input
                  type="date"
                  value={local.date_to ?? ""}
                  onChange={(e) => { setDateError(null); setLocal({ ...local, date_to: e.target.value || undefined }); }}
                  className={`h-8 text-xs ${dateError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                />
              </div>
            </div>
            {dateError && (
              <p className="text-xs text-red-500">{dateError}</p>
            )}
          </div>

          {/* Files */}
          {files.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Arquivos</Label>
              <div className="flex flex-wrap gap-1.5">
                {files.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => toggleArr("files", f.id)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      (local.files ?? []).includes(f.id)
                        ? "bg-blue-600 text-white border-blue-600"
                        : "border-slate-200 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 dark:text-slate-300"
                    }`}
                  >
                    {f.original_filename.replace(/\.xlsx?$/, "")}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stations */}
          {allStations.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Estações</Label>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {allStations.map((s) => (
                  <button
                    key={s}
                    onClick={() => toggleArr("stations", s)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      (local.stations ?? []).includes(s)
                        ? "bg-blue-600 text-white border-blue-600"
                        : "border-slate-200 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 dark:text-slate-300"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Connectors */}
          {allConnectors.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Conectores</Label>
              <div className="flex flex-wrap gap-1.5">
                {allConnectors.map((c) => (
                  <button
                    key={c}
                    onClick={() => toggleArr("connectors", c)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      (local.connectors ?? []).includes(c)
                        ? "bg-blue-600 text-white border-blue-600"
                        : "border-slate-200 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 dark:text-slate-300"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Save as preset */}
          {showSavePreset ? (
            <div className="flex gap-1.5">
              <Input
                className="h-7 text-xs flex-1"
                placeholder="Nome do preset"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && savePreset()}
                autoFocus
              />
              <Button size="sm" className="h-7 px-2 text-xs" onClick={savePreset} disabled={!presetName.trim()}>
                OK
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setShowSavePreset(false); setPresetName(""); }}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <button
              className="text-xs text-muted-foreground hover:text-blue-600 flex items-center gap-1.5 transition-colors"
              onClick={() => setShowSavePreset(true)}
            >
              <Bookmark className="h-3 w-3" />
              Salvar filtros como preset
            </button>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" className="flex-1" onClick={clear}>
              <X className="h-3.5 w-3.5 mr-1" /> Limpar
            </Button>
            <Button size="sm" className="flex-1" onClick={apply}>
              Aplicar
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Active filter pills */}
      {filters.date_from && (
        <Badge variant="secondary" className="gap-1 text-xs">
          <CalendarIcon className="h-3 w-3" />
          {filters.date_from} → {filters.date_to ?? "hoje"}
          <button onClick={() => setFilters({ ...filters, date_from: undefined, date_to: undefined })}>
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}
      {(filters.stations ?? []).length > 0 && (
        <Badge variant="secondary" className="gap-1 text-xs">
          {filters.stations!.length} estação(ões)
          <button onClick={() => setFilters({ ...filters, stations: undefined })}>
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}
    </div>
  );
}
