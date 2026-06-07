'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Map, Layers, SlidersHorizontal, Trophy } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ScoreWeights, UFScore } from '@/utils/scoring';
import type { GapClassificacao } from '@/utils/gapAnalysis';
import { GAP_COLORS } from '@/utils/gapAnalysis';

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
  onExport: () => void;
  filterUF: string;
  onFilterUFChange: (uf: string) => void;
}

const UFS = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
];

const LAYER_LABELS: Record<keyof LayerVisibility, string> = {
  income: 'Renda per capita (UF)',
  fleet: 'Frota EV (UF)',
  chargers: 'Carregadores instalados',
  poi: 'Shoppings / Hipermercados',
  fuel: 'Postos de gasolina',
  traffic: 'Rodovias principais',
  abveGap: 'Gap ABVE (Frotas × Eletropostos)',
  score: 'Score de Oportunidade',
  heatmap: 'Heatmap de Oportunidade',
};

const WEIGHT_LABELS: Record<keyof ScoreWeights, string> = {
  w1: 'Peso: Renda per capita',
  w2: 'Peso: Frota EV',
  w3: 'Peso: Densidade POIs',
  w4: 'Peso: Distância ao carregador (inverso)',
  w5: 'Peso: Fluxo viário',
  w6: 'Peso: Gap ABVE (Frotas vs Eletropostos)',
};

const GAP_BADGE: Record<GapClassificacao, { label: string; style: string }> = {
  critico:  { label: 'Crítico',  style: 'bg-red-600 text-white' },
  alto:     { label: 'Alto',     style: 'bg-orange-500 text-white' },
  moderado: { label: 'Moderado', style: 'bg-yellow-400 text-black' },
  saturado: { label: 'Saturado', style: 'bg-green-600 text-white' },
};

export function MapSidebar({
  layers, onLayersChange,
  weights, onWeightsChange,
  top10, onExport,
  filterUF, onFilterUFChange,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<'layers' | 'weights' | 'rank'>('layers');

  const toggle = (key: keyof LayerVisibility) =>
    onLayersChange({ ...layers, [key]: !layers[key] });

  const setWeight = (key: keyof ScoreWeights, val: number[]) =>
    onWeightsChange({ ...weights, [key]: val[0] });

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
    <div className="absolute top-4 right-4 z-[1000] w-80 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden flex flex-col"
      style={{ maxHeight: 'calc(100% - 32px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-[#163134] text-white">
        <div className="flex items-center gap-2">
          <Map className="h-4 w-4 text-[#06CB3F]" />
          <span className="font-semibold text-sm">Painel de Instalação</span>
        </div>
        <button onClick={() => setCollapsed(true)} className="opacity-70 hover:opacity-100">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Filter */}
      <div className="px-4 py-2 border-b bg-gray-50">
        <Label className="text-xs text-gray-500 mb-1 block">Filtrar por estado (UF)</Label>
        <select
          value={filterUF}
          onChange={(e) => onFilterUFChange(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
        >
          <option value="">Todos os estados</option>
          {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
        </select>
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
        {/* CAMADAS */}
        {tab === 'layers' && (
          <div className="p-4 space-y-3">
            {(Object.keys(LAYER_LABELS) as (keyof LayerVisibility)[]).map((key) => (
              <div key={key} className="flex items-center justify-between gap-2">
                <Label htmlFor={`layer-${key}`} className="text-xs text-gray-700 cursor-pointer leading-tight">
                  {LAYER_LABELS[key]}
                </Label>
                <Switch
                  id={`layer-${key}`}
                  checked={layers[key]}
                  onCheckedChange={() => toggle(key)}
                />
              </div>
            ))}

            {/* Legend for ABVE Gap */}
            {layers.abveGap && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-xs font-medium text-gray-500 mb-2">Legenda — Gap ABVE</p>
                {(Object.entries(GAP_COLORS) as [GapClassificacao, string][]).map(([k, color]) => (
                  <div key={k} className="flex items-center gap-2 mb-1">
                    <div className="w-4 h-4 rounded-sm flex-shrink-0" style={{ background: color }} />
                    <span className="text-xs text-gray-600 capitalize">{k}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PESOS */}
        {tab === 'weights' && (
          <div className="p-4 space-y-5">
            {(Object.keys(WEIGHT_LABELS) as (keyof ScoreWeights)[]).map((key) => (
              <div key={key}>
                <div className="flex justify-between items-center mb-1">
                  <Label className="text-xs text-gray-700 leading-tight">{WEIGHT_LABELS[key]}</Label>
                  <span className="text-xs font-mono font-semibold text-[#163134] ml-2">
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
            <p className="text-[10px] text-gray-400 pt-1">
              Ajuste os pesos para recalcular o Score de Oportunidade em tempo real.
            </p>
          </div>
        )}

        {/* TOP 10 */}
        {tab === 'rank' && (
          <div className="p-4">
            {top10.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">
                Ative a camada de Score para ver o ranking.
              </p>
            ) : (
              <ol className="space-y-2">
                {top10.map((s, i) => {
                  const gapClass = s.inputs.gapAbve >= 75
                    ? 'critico' : s.inputs.gapAbve >= 50
                    ? 'alto' : s.inputs.gapAbve >= 25
                    ? 'moderado' : 'saturado';
                  const badge = GAP_BADGE[gapClass as GapClassificacao];
                  return (
                    <li key={s.uf} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border">
                      <span className="text-sm font-bold text-gray-400 w-5 text-right">{i + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">{s.nome}</p>
                        <p className="text-[10px] text-gray-500">{s.uf}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-bold text-[#163134]">{s.scorePercent}/100</p>
                        <Badge className={cn('text-[9px] px-1.5 py-0', badge.style)}>{badge.label}</Badge>
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
        >
          <Download className="h-3.5 w-3.5" />
          Exportar locais selecionados (CSV)
        </Button>
      </div>
    </div>
  );
}
