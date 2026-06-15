'use client';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import type { Charger } from '@/hooks/useOpenChargeMap';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

const chargerIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:24px;height:24px;border-radius:50%;
    background:#06CB3F;border:2px solid #fff;
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 1px 4px rgba(0,0,0,0.4);font-size:13px;line-height:1;
  ">⚡</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -14],
});

interface Props {
  chargers: Charger[];
}

export function ChargerLayer({ chargers }: Props) {
  return (
    <>
      {chargers.map((c) => (
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Marker key={c.id} position={[c.lat, c.lng]} {...({ icon: chargerIcon } as any)}>
          <Popup>
            <b>{c.title}</b><br />
            {c.address}<br />
            Conectores: {c.connections}<br />
            Operador: {c.operator}
          </Popup>
        </Marker>
      ))}
    </>
  );
}

// Coverage radius rendered imperatively to avoid CircleMarker type issues in react-leaflet v4
export function ChargerCoverageLayer({ chargers }: { chargers: Charger[] }) {
  const map = useMap();

  useEffect(() => {
    const circles = chargers.map((c) =>
      L.circle([c.lat, c.lng], {
        radius: 10000, // 10 km
        color: '#06CB3F',
        fillColor: '#06CB3F',
        fillOpacity: 0.06,
        weight: 1,
      }).addTo(map)
    );
    return () => { circles.forEach((circle) => map.removeLayer(circle)); };
  }, [map, chargers]);

  return null;
}
