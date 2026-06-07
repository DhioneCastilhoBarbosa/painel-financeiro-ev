'use client';
// @ts-expect-error react-leaflet v4 GeoJSON accepts style/onEachFeature from L.GeoJSONOptions
import { GeoJSON } from 'react-leaflet';
import type { IBGEGeoJSON } from '@/hooks/useIBGEData';
import { UF_CODE_TO_SIGLA } from '@/hooks/useIBGEData';
import { GAP_COLORS } from '@/utils/gapAnalysis';
import type { GapScore, GapClassificacao } from '@/utils/gapAnalysis';

interface Props {
  geojson: IBGEGeoJSON;
  gapScores: GapScore[];
}

export function ABVEGapLayer({ geojson, gapScores }: Props) {
  const gapMap = new Map(gapScores.map((g) => [g.uf, g]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const style = (feature: any) => {
    const code: string = feature?.properties?.codarea;
    const uf = UF_CODE_TO_SIGLA[code];
    const gap = uf ? gapMap.get(uf) : undefined;
    return {
      fillColor: gap ? GAP_COLORS[gap.classificacao] : '#cccccc',
      weight: 1.5,
      opacity: 0.9,
      color: '#333',
      fillOpacity: 0.7,
    };
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onEachFeature = (feature: any, layer: any) => {
    const code: string = feature.properties?.codarea;
    const uf = UF_CODE_TO_SIGLA[code] ?? code;
    const gap = gapMap.get(uf);
    if (!gap) return;

    const classLabel: Record<GapClassificacao, string> = {
      critico:  '🔴 Crítico',
      alto:     '🟠 Alto',
      moderado: '🟡 Moderado',
      saturado: '🟢 Saturado',
    };

    layer.bindPopup(
      `<b>${gap.nome} (${uf})</b><br/>
       EVs registrados: ${gap.totalEV.toLocaleString('pt-BR')}<br/>
       Eletropostos: ${gap.totalEletropostos.toLocaleString('pt-BR')}<br/>
       Ratio veículos/ponto: ${gap.ratioVeiculosPorPonto.toFixed(1)}<br/>
       Gap ABVE Index: ${gap.gapIndex}/100<br/>
       Classificação: ${classLabel[gap.classificacao]}`
    );
  };

  return (
    <GeoJSON
      key="abve-gap-layer"
      data={geojson}
      style={style}
      onEachFeature={onEachFeature}
    />
  );
}
