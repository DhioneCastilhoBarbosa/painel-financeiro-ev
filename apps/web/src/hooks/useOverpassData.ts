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
const DEBOUNCE_MS = 1200;

export function useOverpassData() {
  const [data, setData] = useState<OverpassData>({
    fuelStations: [],
    pois: [],
    highways: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchForBounds = useCallback(
    (south: number, west: number, north: number, east: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);

      timerRef.current = setTimeout(async () => {
        // Clamp to Brazil rough bounding box to avoid huge queries
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
out center body;`;

        setLoading(true);
        setError(null);

        try {
          const res = await fetch(OVERPASS_URL, {
            method: 'POST',
            body: query,
            headers: { 'Content-Type': 'text/plain' },
          });
          if (!res.ok) throw new Error('Overpass API indisponível');
          const json = await res.json();
          const elements: OverpassElement[] = json.elements || [];

          setData({
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
          });
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setLoading(false);
        }
      }, DEBOUNCE_MS);
    },
    []
  );

  return { data, loading, error, fetchForBounds };
}
