'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import * as L from 'leaflet';
import type { UFScore } from '@/utils/scoring';

interface Props {
  scores: UFScore[];
}

// O plugin leaflet.heat registra `L.heatLayer` no objeto global `L`. Com bundler +
// import ESM, o side-effect no topo pode rodar antes de `L` existir como global,
// deixando `L.heatLayer` indefinido (e quebrando o mapa ao ativar o heatmap).
// Garantimos o registro: expomos `window.L` e importamos o plugin sob demanda.
let heatReady: Promise<boolean> | null = null;
function ensureHeat(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (!heatReady) {
    heatReady = (async () => {
      const w = window as any;
      if (!w.L) w.L = L;
      try {
        await import('leaflet.heat');
        return typeof (L as any).heatLayer === 'function';
      } catch {
        return false;
      }
    })();
  }
  return heatReady;
}

export function HeatmapLayer({ scores }: Props) {
  const map = useMap();

  useEffect(() => {
    if (!scores.length) return;
    let heat: any = null;
    let cancelled = false;

    ensureHeat().then((ok) => {
      if (cancelled || !map) return;
      const heatLayer = (L as any).heatLayer;
      if (!ok || typeof heatLayer !== 'function') {
        console.warn('[map] leaflet.heat indisponível — camada de heatmap ignorada.');
        return;
      }
      const points: [number, number, number][] = scores.map((s) => [
        s.centroid[0],
        s.centroid[1],
        s.score,
      ]);
      heat = heatLayer(points, {
        radius: 120,
        blur: 90,
        maxZoom: 8,
        max: 1,
        gradient: {
          0.0: '#ffffb2',
          0.25: '#fecc5c',
          0.5: '#fd8d3c',
          0.75: '#f03b20',
          1.0: '#bd0026',
        },
      }).addTo(map);
    });

    return () => {
      cancelled = true;
      if (heat) map.removeLayer(heat);
    };
  }, [map, scores]);

  return null;
}
