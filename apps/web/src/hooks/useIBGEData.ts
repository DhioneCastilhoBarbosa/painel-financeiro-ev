'use client';
import { useState, useEffect } from 'react';

export interface IBGEGeoJSON {
  type: 'FeatureCollection';
  features: Array<{
    type: string;
    properties: { codarea: string; [key: string]: unknown };
    geometry: { type: string; coordinates: unknown[] };
  }>;
}

export type IncomeByUF = Record<string, number>;

// IBGE state code → UF sigla
export const UF_CODE_TO_SIGLA: Record<string, string> = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA',
  '16': 'AP', '17': 'TO', '21': 'MA', '22': 'PI', '23': 'CE',
  '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL', '28': 'SE',
  '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP',
  '41': 'PR', '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT',
  '52': 'GO', '53': 'DF',
};

const GEO_URL =
  'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&resolucao=2';
const INCOME_URL =
  'https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/2021/variaveis/9058?localidades=N3[all]';

let geoCache: IBGEGeoJSON | null = null;
let incomeCache: IncomeByUF | null = null;

export function useIBGEData() {
  const [geojson, setGeojson] = useState<IBGEGeoJSON | null>(geoCache);
  const [incomeByUF, setIncomeByUF] = useState<IncomeByUF>(incomeCache ?? {});
  const [loading, setLoading] = useState(!geoCache || !incomeCache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (geoCache && incomeCache) return;

    Promise.all([
      geoCache
        ? Promise.resolve(geoCache)
        : fetch(GEO_URL).then((r) => {
            if (!r.ok) throw new Error('Falha ao carregar mapa IBGE');
            return r.json() as Promise<IBGEGeoJSON>;
          }),
      incomeCache
        ? Promise.resolve(incomeCache)
        : fetch(INCOME_URL)
            .then((r) => r.json())
            .then((raw) => {
              const income: IncomeByUF = {};
              const series =
                raw?.[0]?.resultados?.[0]?.series ?? [];
              for (const s of series) {
                const code: string = s?.localidade?.id;
                const sigla = UF_CODE_TO_SIGLA[code];
                const val = s?.serie?.['2021'];
                if (sigla && val) income[sigla] = parseFloat(val) || 0;
              }
              return income;
            }),
    ])
      .then(([geo, income]) => {
        geoCache = geo as IBGEGeoJSON;
        incomeCache = income as IncomeByUF;
        setGeojson(geoCache);
        setIncomeByUF(incomeCache);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return { geojson, incomeByUF, loading, error };
}
