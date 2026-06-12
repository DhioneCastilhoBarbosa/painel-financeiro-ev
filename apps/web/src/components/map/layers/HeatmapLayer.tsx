'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { ensureLeafletPlugins } from '@/components/map/leafletPlugins';
import type { UFScore } from '@/utils/scoring';

interface Props {
  scores: UFScore[];
}

export function HeatmapLayer({ scores }: Props) {
  const map = useMap();

  useEffect(() => {
    if (!scores.length) return;
    let heat: any = null;
    let cancelled = false;

    ensureLeafletPlugins().then((L2: any) => {
      if (cancelled || !map) return;
      const heatLayer = L2?.heatLayer;
      if (typeof heatLayer !== 'function') {
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
