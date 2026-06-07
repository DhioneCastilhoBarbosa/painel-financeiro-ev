'use client';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import * as L from 'leaflet';
import 'leaflet.heat';
import type { UFScore } from '@/utils/scoring';

interface Props {
  scores: UFScore[];
}

export function HeatmapLayer({ scores }: Props) {
  const map = useMap();

  useEffect(() => {
    if (!scores.length) return;

    const points: [number, number, number][] = scores.map((s) => [
      s.centroid[0],
      s.centroid[1],
      s.score,
    ]);

    // L.heatLayer is added by leaflet.heat side-effect import
    const heat = L.heatLayer(points, {
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

    return () => { map.removeLayer(heat); };
  }, [map, scores]);

  return null;
}
