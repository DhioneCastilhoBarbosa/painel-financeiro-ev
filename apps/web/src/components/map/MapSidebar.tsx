'use client';
import { useState } from 'react';
import {
  ChevronLeft, ChevronRight, Download, Map,
  Layers, SlidersHorizontal, Trophy, Loader2,
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ScoreWeights, UFScore } from '@/utils/scoring';
import { scoreToColor } from '@/utils/scoring';
import type { GapClassificacao } from '@/utils/gapAnalysis';
import { GAP_COLORS } from '@/utils/gapAnalysis';
import type { MunicipioScore } from '@/hooks/useMunicipioScore';

export interface LayerVisibility {
  income: boolean;
  fleet: boolean;
  chargers: boolean;
  poi: boolean;
  fuel: boolean;
  traffic: boolean;
  abveGap: boolean;
  score: boolean;
  heatmap: boolean;
}

interface Props {
  layers: LayerVisibility;
  onLayersChange: (layers: LayerVisibility) => void;
  weights: ScoreWeights;
  onWeightsChange: (w: ScoreWeights) => void;
  top10: UFScore[];
  allScores: UFScore[];
  /** Top 10 municípios da UF selecionada (substitui o ranking por UF quando há filtro). */
  muniTop?: MunicipioScore[];
  onExport: () => void;
  filterUF: string;
  onFilterUFChange: (uf: string) => void;
  ibgeLoading: boolean;
  abveLoading: boolean;
}

const UFS = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
];

// Layers that require IBGE GeoJSON (show spinner while ibgeLoading)
const NEEDS_IBGE: (keyof LayerVisibility)[] = [
  'income', 'fleet', 'abveGap', 'score',
];

// Layers that require Overpass API (on-demand when visible)
const NEEDS_OVERPASS: (keyof LayerVisibility)[] = ['poi', 'fuel', 'traffic'];

const LAYER_LABELS: Record<keyof LayerVisibility, string> = {
  income:   'Renda per capita (UF)',
  fleet:    'Frota EV (UF)',
  chargers: 'Carregadores instalados',
  poi:      'Shoppings / Hipermercados',
  fuel:     'Postos de gasolina',
  traffic:  'Rodovias principais',
  abveGap:  'Gap ABVE (Frotas × Eletropostos)',
  score:    'Score de Oportunidade',
  heatmap:  'Heatmap de Oportunidade',
};

const LAYER_SUBLABEL: Partial<Record<keyof LayerVisibility, string>> = {
  income:   'IBGE SIDRA · por estado',
  fleet:    'ABVE CSV · por estado',
  chargers: 'Open Charge Map · pontos',
  poi:      'Overpass OSM · ao mover mapa',
  fuel:     'Overpass OSM · candidatos retrofit',
  traffic:  'Overpass OSM · ao mover mapa',
  abveGap:  'ABVE CSV · por estado',
  score:    'Score composto · pesos ajustáveis',
  heatmap:  'Baseado no Score composto',
};

const WEIGHT_LABELS: Record<keyof ScoreWeights, string> = {
  w1: 'Renda per capita',
  w2: 'Frota EV',
  w3: 'Densidade POIs',
  w4: 'Distância ao carregador (inverso)',
  w5: 'Fluxo viário',
  w6: 'Gap ABVE (Frotas vs Eletropostos)',
};

const GAP_BADGE: Record<GapClassificacao, { label: string; style: string }> = {
  critico:  { label: 'Crítico',  style: 'bg-red-600 text-white' },
  alto:     { label: 'Alto',     style: 'bg-orange-500 text-white' },
  moderado: { label: 'Moderado', style: 'bg-yellow-400 text-black' },
  saturado: { label: 'Saturado', style: 'bg-green-600 text-white' },
};

function gapClassFromIndex(idx: number): GapClassificacao {
  if (idx >= 75) return 'critico';
  if (idx >= 50) return 'alto';
  if (idx >= 25) return 'moderado';
  return 'saturado';
}

export function MapSidebar({
  layers, onLayersChange,
  weights, onWeightsChange,
  top10, allScores, muniTop, onExport,
  filterUF, onFilterUFChange,
  ibgeLoading, abveLoading,
}: Props) {
  const showMuni = !!filterUF && !!muniTop && muniTop.length > 0;
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<'layers' | 'weights' | 'rank'>('layers');

  const toggle = (key: keyof LayerVisibility) =>
    onLayersChange({ ...layers, [key]: !layers[key] });

  const setWeight = (key: keyof ScoreWeights, val: number[]) =>
    onWeightsChange({ ...weights, [key]: val[0] });

  const isLayerPending = (key: keyof LayerVisibility) =>
    NEEDS_IBGE.includes(key) && ibgeLoading;

  if (collapsed) {
    return (
      <div className="absolute top-4 right-4 z-[1000]">
        <button
          onClick={() => setCollapsed(false)}
          className="bg-white rounded-full shadow-lg p-2 border border-gray-200 hover:bg-gray-50 transition-colors"
          title="Abrir painel"
        >
          <ChevronLeft className="h-5 w-5 text-gray-700" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="absolute top-4 right-4 z-[1000] w-80 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden flex flex-col"
      style={{ maxHeight: 'calc(100% - 32px)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-[#163134] text-white">
        <div className="flex items-center gap-2">
          <Map className="h-4 w-4 text-[#06CB3F]" />
          <span className="font-semibold text-sm">Painel de Instalação</span>
          {(ibgeLoading || abveLoading) && (
            <Loader2 className="h-3.5 w-3.5 text-[#06CB3F] animate-spin" />
          )}
        </div>
        <button onClick={() => setCollapsed(true)} className="opacity-70 hover:opacity-100">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Filter */}
      <div className="px-4 py-2.5 border-b bg-gray-50">
        <Label className="text-xs text-gray-500 mb-1 block">Filtrar por estado (UF)</Label>
        <select
          value={filterUF}
          onChange={(e) => onFilterUFChange(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#06CB3F]"
        >
          <option value="">Todos os estados</option>
          {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
        </select>
        {filterUF && (
          <p className="text-[10px] text-[#06CB3F] mt-1">
            ↗ Mapa centralizado em {filterUF}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {([
          ['layers', <Layers key="l" className="h-3.5 w-3.5" />, 'Camadas'],
          ['weights', <SlidersHorizontal key="w" className="h-3.5 w-3.5" />, 'Pesos'],
          ['rank', <Trophy key="r" className="h-3.5 w-3.5" />, 'Top 10'],
        ] as const).map(([key, icon, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium border-b-2 transition-colors',
              tab === key
                ? 'border-[#06CB3F] text-[#163134]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            {icon}
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">

        {/* ── CAMADAS ── */}
        {tab === 'layers' && (
          <div className="p-4 space-y-3">
            {(Object.keys(LAYER_LABELS) as (keyof LayerVisibility)[]).map((key) => {
              const pending = isLayerPending(key);
              const overpass = NEEDS_OVERPASS.includes(key);
              return (
                <div key={key} className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <Label
                        htmlFor={`layer-${key}`}
                        className="text-xs text-gray-700 cursor-pointer leading-tight"
                      >
                        {LAYER_LABELS[key]}
                      </Label>
                      {pending && layers[key] && (
                        <Loader2 className="h-3 w-3 text-gray-400 animate-spin flex-shrink-0" />
                      )}
                    </div>
                    {LAYER_SUBLABEL[key] && (
                      <p className="text-[10px] text-gray-400 mt-0.5">{LAYER_SUBLABEL[key]}</p>
                    )}
                    {overpass && layers[key] && (
                      <p className="text-[10px] text-blue-500 mt-0.5">Move o mapa para carregar</p>
                    )}
                  </div>
                  <Switch
                    id={`layer-${key}`}
                    checked={layers[key]}
                    onCheckedChange={() => toggle(key)}
                    className="flex-shrink-0 mt-0.5"
                  />
                </div>
              );
            })}

            {/* ABVE Gap legend */}
            {layers.abveGap && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-xs font-medium text-gray-500 mb-2">Legenda — Gap ABVE</p>
                {(Object.entries(GAP_COLORS) as [GapClassificacao, string][]).map(([k, color]) => (
                  <div key={k} className="flex items-center gap-2 mb-1">
                    <div className="w-4 h-4 rounded-sm flex-shrink-0" style={{ background: color }} />
                    <span className="text-xs text-gray-600 capitalize">{k}</span>
                  </div>
                ))}
                {ibgeLoading && (
                  <p className="text-[10px] text-amber-600 mt-2">
                    ⏳ Aguardando polígonos do IBGE para renderizar…
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── PESOS ── */}
        {tab === 'weights' && (
          <div className="p-4 space-y-5">
            {(Object.keys(WEIGHT_LABELS) as (keyof ScoreWeights)[]).map((key) => (
              <div key={key}>
                <div className="flex justify-between items-center mb-1">
                  <Label className="text-xs text-gray-700 leading-tight">
                    {WEIGHT_LABELS[key]}
                  </Label>
                  <span className="text-xs font-mono font-semibold text-[#163134] ml-2 flex-shrink-0">
                    {weights[key]}
                  </span>
                </div>
                <Slider
                  min={0}
                  max={5}
                  step={0.5}
                  value={[weights[key]]}
                  onValueChange={(val) => setWeight(key, val)}
                  className="mt-1"
                />
              </div>
            ))}
            <div className="pt-2 border-t">
              <p className="text-[10px] text-gray-400">
                Ative as camadas <b>Score de Oportunidade</b> ou <b>Heatmap</b> para ver o resultado.
              </p>
            </div>
          </div>
        )}

        {/* ── TOP 10 ── */}
        {tab === 'rank' && showMuni && (
          <div className="p-4">
            <p className="text-[10px] text-gray-400 mb-3">
              Top 10 cidades de <b>{filterUF}</b> por score de oportunidade
              (frota EV real ABVE × eletropostos).
            </p>
            <ol className="space-y-2">
              {muniTop!.slice(0, 10).map((m, i) => (
                <li key={m.code} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border hover:border-[#06CB3F]/40 transition-colors">
                  <span className="text-sm font-bold text-gray-400 w-5 text-right flex-shrink-0">{i + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{m.nome}</p>
                    <p className="text-[10px] text-gray-500">
                      Frota EV: {Math.round(m.frotaEst).toLocaleString('pt-BR')} · Eletropostos: {m.eletropostos}
                    </p>
                  </div>
                  <span
                    className="shrink-0 text-xs font-bold rounded px-1.5 py-0.5 text-white"
                    style={{ backgroundColor: scoreToColor(m.score) }}
                  >
                    {m.scorePercent}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {tab === 'rank' && !showMuni && (
          <div className="p-4">
            <p className="text-[10px] text-gray-400 mb-3">
              Ranking por estado (UF). Selecione um estado no filtro acima para ver o
              Top 10 de cidades.
              {allScores.length > 0
                ? ` Score calculado para ${allScores.length} estados.`
                : ' Aguardando dados…'}
            </p>

            {top10.length === 0 ? (
              <div className="text-center py-6 text-xs text-gray-400 space-y-1">
                <Trophy className="h-8 w-8 mx-auto text-gray-200 mb-2" />
                <p>Nenhum dado disponível.</p>
                {ibgeLoading || abveLoading ? (
                  <p className="text-amber-600">Carregando dados…</p>
                ) : (
                  <p>Verifique se os CSVs ABVE estão em <code>public/data/abve/</code></p>
                )}
              </div>
            ) : (
              <ol className="space-y-2">
                {top10.map((s, i) => {
                  const gapClass = gapClassFromIndex(s.inputs.gapAbve);
                  const badge = GAP_BADGE[gapClass];
                  return (
                    <li key={s.uf} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border hover:border-[#06CB3F]/40 transition-colors">
                      <span className="text-sm font-bold text-gray-400 w-5 text-right flex-shrink-0">
                        {i + 1}.
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">{s.nome}</p>
                        <p className="text-[10px] text-gray-500">
                          {s.uf} · Frota: {s.inputs.frota.toLocaleString('pt-BR')} EVs
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-bold text-[#163134]">{s.scorePercent}/100</p>
                        <Badge className={cn('text-[9px] px-1.5 py-0 mt-0.5 leading-tight', badge.style)}>
                          {badge.label}
                        </Badge>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t p-3">
        <Button
          size="sm"
          variant="outline"
          className="w-full text-xs gap-1.5 border-[#163134] text-[#163134] hover:bg-[#163134]/5"
          onClick={onExport}
          disabled={top10.length === 0}
        >
          <Download className="h-3.5 w-3.5" />
          Exportar locais selecionados (CSV)
        </Button>
      </div>
    </div>
  );
}
