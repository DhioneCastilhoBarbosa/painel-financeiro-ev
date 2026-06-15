'use client';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { polyline, type Polyline } from 'leaflet';
import type { OverpassWay } from '@/hooks/useOverpassData';

const HIGHWAY_STYLE: Record<string, { color: string; weight: number }> = {
  motorway: { color: '#e74c3c', weight: 3 },
  trunk:    { color: '#e67e22', weight: 2.5 },
  primary:  { color: '#f1c40f', weight: 2 },
};

interface Props {
  highways: OverpassWay[];
}

export function TrafficLayer({ highways }: Props) {
  const map = useMap();

  useEffect(() => {
    const lines: Polyline[] = [];

    highways.forEach((way) => {
      if (!way.geometry?.length) return;
      const latlngs = way.geometry.map((p) => [p.lat, p.lon] as [number, number]);
      const type = way.tags?.highway ?? 'primary';
      const style = HIGHWAY_STYLE[type] ?? { color: '#95a5a6', weight: 1.5 };

      const line = polyline(latlngs, { color: style.color, weight: style.weight, opacity: 0.75 })
        .bindPopup(way.tags?.name ?? `Rodovia — ${type}`)
        .addTo(map);

      lines.push(line);
    });

    return () => { lines.forEach((l) => map.removeLayer(l)); };
  }, [map, highways]);

  return null;
}
