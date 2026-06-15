'use client';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { GeoJSON } from 'react-leaflet';
import type { IBGEGeoJSON } from '@/hooks/useIBGEData';
import { UF_CODE_TO_SIGLA } from '@/hooks/useIBGEData';
import { GAP_COLORS } from '@/utils/gapAnalysis';
import type { GapScore, GapClassificacao } from '@/utils/gapAnalysis';
import { UF_CENTROIDS } from '@/hooks/useOpportunityScore';

interface Props {
  geojson: IBGEGeoJSON | null;
  gapScores: GapScore[];
}

const classLabel: Record<GapClassificacao, string> = {
  critico:  '🔴 Crítico',
  alto:     '🟠 Alto',
  moderado: '🟡 Moderado',
  saturado: '🟢 Saturado',
};

// When IBGE GeoJSON isn't available, render circle markers at UF centroids
function FallbackCircles({ gapScores }: { gapScores: GapScore[] }) {
  const map = useMap();

  useEffect(() => {
    const circles: L.CircleMarker[] = gapScores.map((gap) => {
      const centroid = UF_CENTROIDS[gap.uf];
      if (!centroid) return null as unknown as L.CircleMarker;

      const circle = L.circleMarker(centroid, {
        radius: 18,
        fillColor: GAP_COLORS[gap.classificacao],
        color: '#fff',
        weight: 2,
        fillOpacity: 0.85,
      });

      circle.bindTooltip(`${gap.uf} — ${gap.nome}`, { permanent: false });
      circle.bindPopup(
        `<b>${gap.nome} (${gap.uf})</b><br/>
         EVs: ${gap.totalEV.toLocaleString('pt-BR')}<br/>
         Eletropostos: ${gap.totalEletropostos.toLocaleString('pt-BR')}<br/>
         Ratio: ${gap.ratioVeiculosPorPonto.toFixed(1)} veíc./ponto<br/>
         Gap Index: ${gap.gapIndex}/100<br/>
         ${classLabel[gap.classificacao]}`
      );

      circle.addTo(map);
      return circle;
    }).filter(Boolean);

    return () => { circles.forEach((c) => map.removeLayer(c)); };
  }, [map, gapScores]);

  return null;
}

export function ABVEGapLayer({ geojson, gapScores }: Props) {
  const gapMap = new Map(gapScores.map((g) => [g.uf, g]));

  // If GeoJSON not loaded, use circle markers as fallback
  if (!geojson) {
    return <FallbackCircles gapScores={gapScores} />;
  }

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

    layer.bindPopup(
      `<b>${gap.nome} (${uf})</b><br/>
       EVs: ${gap.totalEV.toLocaleString('pt-BR')}<br/>
       Eletropostos: ${gap.totalEletropostos.toLocaleString('pt-BR')}<br/>
       Ratio: ${gap.ratioVeiculosPorPonto.toFixed(1)} veíc./ponto<br/>
       Gap Index: ${gap.gapIndex}/100<br/>
       ${classLabel[gap.classificacao]}`
    );
  };

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <GeoJSON key="abve-gap-layer" {...({ data: geojson, style, onEachFeature } as any)} />
  );
}
