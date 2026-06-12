'use client';
import { useState, useCallback, useRef } from 'react';

export interface OverpassNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

export interface OverpassWay {
  type: 'way';
  id: number;
  center?: { lat: number; lon: number };
  geometry?: Array<{ lat: number; lon: number }>;
  tags: Record<string, string>;
}

export type OverpassElement = OverpassNode | OverpassWay;

export interface OverpassData {
  fuelStations: OverpassNode[];
  pois: OverpassElement[];
  highways: OverpassWay[];
}

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const DEBOUNCE_MS = 1500;          // espera o usuário parar de mover o mapa
const MIN_INTERVAL_MS = 4000;      // intervalo mínimo entre requisições reais
const BACKOFF_MS = 25_000;         // após 429, pausa antes de tentar de novo
const MAX_BBOX_DEG2 = 9;           // área máxima (graus²) — acima disso, pede zoom

const EMPTY: OverpassData = { fuelStations: [], pois: [], highways: [] };

export function useOverpassData() {
  const [data, setData] = useState<OverpassData>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Aviso não-fatal (ex.: "aproxime o mapa") para guiar o usuário. */
  const [notice, setNotice] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReqRef = useRef(0);
  const backoffUntilRef = useRef(0);
  const cacheRef = useRef<Map<string, OverpassData>>(new Map());

  const fetchForBounds = useCallback(
    (south: number, west: number, north: number, east: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);

      timerRef.current = setTimeout(async () => {
        // Consulta gigante (Brasil inteiro / vários estados) estoura o Overpass
        // público — exige aproximar o mapa primeiro.
        const area = Math.abs((north - south) * (east - west));
        if (area > MAX_BBOX_DEG2) {
          setNotice('Aproxime o mapa para carregar POIs, rodovias e postos.');
          return;
        }

        const now = Date.now();
        if (now < backoffUntilRef.current) {
          setNotice('Aguardando o limite do Overpass liberar…');
          return;
        }
        if (now - lastReqRef.current < MIN_INTERVAL_MS) return; // throttle

        // Cache por bbox arredondada (~1km) — evita refetch ao micro-mover.
        const key = [south, west, north, east].map((v) => v.toFixed(2)).join(',');
        const cached = cacheRef.current.get(key);
        if (cached) { setData(cached); setNotice(null); setError(null); return; }

        const bbox = `${Math.max(south, -34)},${Math.max(west, -74)},${Math.min(north, 6)},${Math.min(east, -28)}`;
        const query = `[out:json][timeout:25];
(
  node["amenity"="fuel"](${bbox});
  node["shop"="supermarket"](${bbox});
  node["shop"="mall"](${bbox});
  way["shop"="mall"](${bbox});
  node["shop"="department_store"](${bbox});
  way["highway"~"motorway|trunk|primary"](${bbox});
);
out geom;`;

        lastReqRef.current = now;
        setLoading(true);
        setError(null);
        setNotice(null);

        try {
          const res = await fetch(OVERPASS_URL, {
            method: 'POST',
            body: query,
            headers: { 'Content-Type': 'text/plain' },
          });
          if (res.status === 429) {
            backoffUntilRef.current = Date.now() + BACKOFF_MS;
            setNotice('Muitas requisições ao Overpass — aguarde ~25s e mova o mapa.');
            return;
          }
          if (!res.ok) throw new Error('Overpass API indisponível');
          const json = await res.json();
          const elements: OverpassElement[] = json.elements || [];

          const result: OverpassData = {
            fuelStations: elements.filter(
              (e): e is OverpassNode =>
                e.type === 'node' && e.tags?.amenity === 'fuel'
            ),
            pois: elements.filter(
              (e) =>
                e.tags?.shop === 'supermarket' ||
                e.tags?.shop === 'mall' ||
                e.tags?.shop === 'department_store'
            ),
            highways: elements.filter(
              (e): e is OverpassWay => e.type === 'way' && !!e.tags?.highway
            ),
          };
          cacheRef.current.set(key, result);
          setData(result);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setLoading(false);
        }
      }, DEBOUNCE_MS);
    },
    []
  );

  return { data, loading, error, notice, fetchForBounds };
}
