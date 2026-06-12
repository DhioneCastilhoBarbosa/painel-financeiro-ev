'use client';
import type { ComponentType } from 'react';
import { GeoJSON as GeoJSONBase } from 'react-leaflet';
import type { IBGEGeoJSON } from '@/hooks/useIBGEData';

// react-leaflet v4 omite style/onEachFeature da tipagem pública do GeoJSON;
// faz cast para aceitar as opções padrão do Leaflet sem @ts-expect-error frágil.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const GeoJSON = GeoJSONBase as unknown as ComponentType<any>;
import type { MunicipioScore } from '@/hooks/useMunicipioScore';
import { scoreToColor } from '@/utils/scoring';

interface Props {
  uf: string;
  geojson: IBGEGeoJSON;
  scoresByCode: Map<string, MunicipioScore>;
}

export function MunicipioScoreLayer({ uf, geojson, scoresByCode }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const style = (feature: any) => {
    const code: string = feature?.properties?.codarea;
    const m = scoresByCode.get(code);
    return {
      fillColor: m ? scoreToColor(m.score) : '#cccccc',
      weight: 1,
      opacity: 0.9,
      color: '#555',
      fillOpacity: 0.65,
    };
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onEachFeature = (feature: any, layer: any) => {
    const code: string = feature?.properties?.codarea;
    const m = scoresByCode.get(code);
    if (!m) return;
    const fonteLabel = m.fonte === 'abve' ? 'ABVE' : m.fonte === 'ocm' ? 'Open Charge Map' : 'sem registro';
    const detalheEletro = m.fonte === 'abve'
      ? `${m.eletropostos} <span style="color:#64748b">(AC ${m.ac} · DC ${m.dc})</span>`
      : `${m.eletropostos}`;
    layer.bindTooltip(`${m.nome} — ${m.scorePercent}/100`, { sticky: true });
    layer.bindPopup(
      `<b>${m.nome} (${m.uf})</b><br/>
       Score de oportunidade: <b>${m.scorePercent}/100</b><br/>
       População: ${m.pop.toLocaleString('pt-BR')}<br/>
       Frota EV ${m.frotaFonte === 'abve' ? '(BEV+PHEV, ABVE)' : '(estimada)'}: ${Math.round(m.frotaEst).toLocaleString('pt-BR')}<br/>
       Eletropostos: ${detalheEletro}<br/>
       Carência (frota/ponto): ${m.gap.toFixed(1)}<br/>
       <span style="color:#94a3b8;font-size:11px">Fonte eletropostos: ${fonteLabel}</span>`
    );
  };

  return (
    <GeoJSON
      key={`muni-${uf}`}
      data={geojson}
      style={style}
      onEachFeature={onEachFeature}
    />
  );
}
