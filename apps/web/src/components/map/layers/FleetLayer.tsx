'use client';
// @ts-expect-error react-leaflet v4 GeoJSON accepts style/onEachFeature from L.GeoJSONOptions
import { GeoJSON } from 'react-leaflet';
import type { IBGEGeoJSON } from '@/hooks/useIBGEData';
import { UF_CODE_TO_SIGLA } from '@/hooks/useIBGEData';
import { minMaxNormalize } from '@/utils/normalize';
import type { FrotaRow } from '@/utils/gapAnalysis';

function fleetToColor(norm: number): string {
  if (norm >= 0.75) return '#084081';
  if (norm >= 0.5) return '#0868ac';
  if (norm >= 0.25) return '#43a2ca';
  if (norm >= 0.1) return '#7bccc4';
  return '#f0f9e8';
}

interface Props {
  geojson: IBGEGeoJSON;
  frotasPorUF: FrotaRow[];
}

export function FleetLayer({ geojson, frotasPorUF }: Props) {
  const frotaMap = new Map(
    frotasPorUF.map((f) => [f.uf, f.total_veiculos_ev + f.total_phev])
  );
  const values = Array.from(frotaMap.values());
  const min = Math.min(...values);
  const max = Math.max(...values);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const style = (feature: any) => {
    const code: string = feature?.properties?.codarea;
    const uf = UF_CODE_TO_SIGLA[code];
    const value = uf ? (frotaMap.get(uf) ?? 0) : 0;
    return {
      fillColor: fleetToColor(minMaxNormalize(value, min, max)),
      weight: 1,
      opacity: 0.8,
      color: '#555',
      fillOpacity: 0.65,
    };
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onEachFeature = (feature: any, layer: any) => {
    const code: string = feature.properties?.codarea;
    const uf = UF_CODE_TO_SIGLA[code] ?? code;
    const frota = frotasPorUF.find((f) => f.uf === uf);
    layer.bindPopup(
      `<b>${uf} — ${frota?.nome_estado ?? ''}</b><br/>
       EVs puros: ${frota?.total_veiculos_ev?.toLocaleString('pt-BR') ?? 'N/D'}<br/>
       PHEVs: ${frota?.total_phev?.toLocaleString('pt-BR') ?? 'N/D'}<br/>
       Híbridos: ${frota?.total_hibridos?.toLocaleString('pt-BR') ?? 'N/D'}`
    );
  };

  return (
    <GeoJSON
      key="fleet-layer"
      data={geojson}
      style={style}
      onEachFeature={onEachFeature}
    />
  );
}
