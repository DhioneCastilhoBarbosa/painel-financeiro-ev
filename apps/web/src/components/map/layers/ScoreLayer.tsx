'use client';
// @ts-expect-error react-leaflet v4 GeoJSON accepts style/onEachFeature from L.GeoJSONOptions
import { GeoJSON } from 'react-leaflet';
import type { IBGEGeoJSON } from '@/hooks/useIBGEData';
import { UF_CODE_TO_SIGLA } from '@/hooks/useIBGEData';
import { scoreToColor } from '@/utils/scoring';
import type { UFScore } from '@/utils/scoring';

interface Props {
  geojson: IBGEGeoJSON;
  scores: UFScore[];
  onSelectUF?: (score: UFScore) => void;
}

export function ScoreLayer({ geojson, scores, onSelectUF }: Props) {
  const scoreMap = new Map(scores.map((s) => [s.uf, s]));
  const scoreKey = scores.map((s) => s.scorePercent).join(',');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const style = (feature: any) => {
    const code: string = feature?.properties?.codarea;
    const uf = UF_CODE_TO_SIGLA[code];
    const s = uf ? scoreMap.get(uf) : undefined;
    return {
      fillColor: s ? scoreToColor(s.score) : '#e5e5e5',
      weight: 1,
      opacity: 0.8,
      color: '#555',
      fillOpacity: 0.72,
    };
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onEachFeature = (feature: any, layer: any) => {
    const code: string = feature.properties?.codarea;
    const uf = UF_CODE_TO_SIGLA[code] ?? code;
    const s = scoreMap.get(uf);
    if (!s) return;

    layer.bindPopup(
      `<b>${s.nome} (${uf})</b><br/>
       Score de Oportunidade: <b>${s.scorePercent}/100</b><br/>
       Renda: ${s.inputs.renda ? `R$ ${s.inputs.renda.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : 'N/D'}<br/>
       Frota EV: ${s.inputs.frota.toLocaleString('pt-BR')}<br/>
       Gap ABVE: ${s.inputs.gapAbve}/100`
    );

    layer.on('click', () => onSelectUF?.(s));
  };

  return (
    <GeoJSON
      key={`score-${scoreKey}`}
      data={geojson}
      style={style}
      onEachFeature={onEachFeature}
    />
  );
}
