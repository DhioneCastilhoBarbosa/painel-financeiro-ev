'use client';
import { GeoJSON } from 'react-leaflet';
import type { IBGEGeoJSON, IncomeByUF } from '@/hooks/useIBGEData';
import { UF_CODE_TO_SIGLA } from '@/hooks/useIBGEData';
import { minMaxNormalize } from '@/utils/normalize';

function incomeToColor(norm: number): string {
  if (norm >= 0.75) return '#800026';
  if (norm >= 0.5) return '#e31a1c';
  if (norm >= 0.25) return '#fc4e2a';
  if (norm >= 0.1) return '#feb24c';
  return '#ffeda0';
}

interface Props {
  geojson: IBGEGeoJSON;
  incomeByUF: IncomeByUF;
}

export function IncomeLayer({ geojson, incomeByUF }: Props) {
  const values = Object.values(incomeByUF).filter(Boolean);
  const min = Math.min(...values);
  const max = Math.max(...values);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const style = (feature: any) => {
    const code: string = feature?.properties?.codarea;
    const uf = UF_CODE_TO_SIGLA[code];
    const value = uf ? (incomeByUF[uf] ?? 0) : 0;
    return {
      fillColor: incomeToColor(minMaxNormalize(value, min, max)),
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
    const value = incomeByUF[uf];
    layer.bindPopup(
      `<b>${uf}</b><br/>PIB per capita (2021): ${
        value
          ? `R$ ${value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
          : 'N/D'
      }`
    );
  };

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <GeoJSON key="income-layer" {...({ data: geojson, style, onEachFeature } as any)} />
  );
}
