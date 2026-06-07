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
const TIMEOUT_MS = 20_000;

let geoCache: IBGEGeoJSON | null = null;
let incomeCache: IncomeByUF | null = null;

function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(id));
}

export function useIBGEData() {
  const [geojson, setGeojson] = useState<IBGEGeoJSON | null>(geoCache);
  const [incomeByUF, setIncomeByUF] = useState<IncomeByUF>(incomeCache ?? {});
  const [loading, setLoading] = useState(!geoCache || !incomeCache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (geoCache && incomeCache) return;

    const geoPromise = geoCache
      ? Promise.resolve(geoCache)
      : fetchWithTimeout(GEO_URL, TIMEOUT_MS)
          .then((r) => {
            if (!r.ok) throw new Error(`IBGE GeoJSON HTTP ${r.status}`);
            return r.json() as Promise<IBGEGeoJSON>;
          });

    const incomePromise = incomeCache
      ? Promise.resolve(incomeCache)
      : fetchWithTimeout(INCOME_URL, TIMEOUT_MS)
          .then((r) => r.json())
          .then((raw): IncomeByUF => {
            const income: IncomeByUF = {};
            const series = raw?.[0]?.resultados?.[0]?.series ?? [];
            for (const s of series) {
              const code: string = s?.localidade?.id;
              const sigla = UF_CODE_TO_SIGLA[code];
              const val = s?.serie?.['2021'];
              if (sigla && val) income[sigla] = parseFloat(val) || 0;
            }
            return income;
          });

    Promise.all([geoPromise, incomePromise])
      .then(([geo, income]) => {
        geoCache = geo as IBGEGeoJSON;
        incomeCache = income as IncomeByUF;
        setGeojson(geoCache);
        setIncomeByUF(incomeCache);
        setLoading(false);
      })
      .catch((err: Error) => {
        const msg = err.name === 'AbortError'
          ? 'Timeout: IBGE demorou mais de 20s. Camadas de mapa desativadas.'
          : err.message;
        setError(msg);
        setLoading(false);
        // Proceed without IBGE — point layers still work
      });
  }, []);

  return { geojson, incomeByUF, loading, error };
}
