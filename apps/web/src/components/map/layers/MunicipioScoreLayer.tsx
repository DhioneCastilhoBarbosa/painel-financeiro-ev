'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import * as L from 'leaflet';
import type { IBGEGeoJSON } from '@/hooks/useIBGEData';
import type { MunicipioScore } from '@/hooks/useMunicipioScore';
import { scoreToColor } from '@/utils/scoring';

interface Props {
  uf: string;
  geojson: IBGEGeoJSON;
  scoresByCode: Map<string, MunicipioScore>;
}

// Camada imperativa (L.geoJSON adicionada/removida no useEffect) em vez do
// <GeoJSON> do react-leaflet: com ~1MB de polígonos por estado e troca frequente
// de UF, o componente declarativo acumulava camadas e travava o mapa após alguns
// estados. Aqui a remoção é garantida na limpeza do efeito.
export function MunicipioScoreLayer({ uf, geojson, scoresByCode }: Props) {
  const map = useMap();

  useEffect(() => {
    if (!map || !geojson) return;

    const layer = (L as any).geoJSON(geojson as any, {
      style: (feature: any) => {
        const m = scoresByCode.get(feature?.properties?.codarea);
        return {
          fillColor: m ? scoreToColor(m.score) : '#cccccc',
          weight: 1,
          opacity: 0.9,
          color: '#555',
          fillOpacity: 0.65,
        };
      },
      onEachFeature: (feature: any, lyr: any) => {
        const m = scoresByCode.get(feature?.properties?.codarea);
        if (!m) return;
        const fonteLabel = m.fonte === 'abve' ? 'ABVE' : m.fonte === 'ocm' ? 'Open Charge Map' : 'sem registro';
        const detalheEletro = m.fonte === 'abve'
          ? `${m.eletropostos} <span style="color:#64748b">(AC ${m.ac} · DC ${m.dc})</span>`
          : `${m.eletropostos}`;
        lyr.bindTooltip(`${m.nome} — ${m.scorePercent}/100`, { sticky: true });
        lyr.bindPopup(
          `<b>${m.nome} (${m.uf})</b><br/>
           Score de oportunidade: <b>${m.scorePercent}/100</b><br/>
           População: ${m.pop.toLocaleString('pt-BR')}<br/>
           Frota EV ${m.frotaFonte === 'abve' ? '(BEV+PHEV, ABVE)' : '(estimada)'}: ${Math.round(m.frotaEst).toLocaleString('pt-BR')}<br/>
           Eletropostos: ${detalheEletro}<br/>
           Carência (frota/ponto): ${m.gap.toFixed(1)}<br/>
           <span style="color:#94a3b8;font-size:11px">Fonte eletropostos: ${fonteLabel}</span>`
        );
      },
    });
    layer.addTo(map);

    return () => { map.removeLayer(layer); };
  }, [map, uf, geojson, scoresByCode]);

  return null;
}
