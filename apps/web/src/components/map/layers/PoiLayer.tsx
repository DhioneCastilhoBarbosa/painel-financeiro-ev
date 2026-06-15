'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { ensureLeafletPlugins } from '@/components/map/leafletPlugins';
import type { OverpassElement, OverpassNode, OverpassWay } from '@/hooks/useOverpassData';

const poiIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:20px;height:20px;border-radius:4px;
    background:#8b5cf6;border:2px solid #fff;
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 1px 3px rgba(0,0,0,0.4);font-size:11px;line-height:1;
  ">🛍</div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -12],
});

const fuelIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:20px;height:20px;border-radius:50%;
    background:#f59e0b;border:2px solid #fff;
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 1px 3px rgba(0,0,0,0.4);font-size:11px;line-height:1;
  ">⛽</div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -12],
});

function getLatLng(el: OverpassElement): [number, number] | null {
  if (el.type === 'node') return [(el as OverpassNode).lat, (el as OverpassNode).lon];
  const way = el as OverpassWay;
  if (way.center) return [way.center.lat, way.center.lon];
  // Com `out geom;` os ways trazem a geometria — usa o centroide dos vértices.
  if (way.geometry?.length) {
    const n = way.geometry.length;
    const lat = way.geometry.reduce((s, p) => s + p.lat, 0) / n;
    const lon = way.geometry.reduce((s, p) => s + p.lon, 0) / n;
    return [lat, lon];
  }
  return null;
}

interface Props {
  pois: OverpassElement[];
  fuelStations: OverpassNode[];
  showPois: boolean;
  showFuel: boolean;
}

export function PoiLayer({ pois, fuelStations, showPois, showFuel }: Props) {
  const map = useMap();

  useEffect(() => {
    if (!showPois && !showFuel) return;
    const groups: any[] = [];
    let cancelled = false;

    ensureLeafletPlugins().then((L2: any) => {
      if (cancelled || !map) return;
      if (typeof L2?.markerClusterGroup !== 'function') {
        console.warn('[map] leaflet.markercluster indisponível — agrupamento ignorado.');
        return;
      }

      if (showPois && pois.length) {
        const poiCluster = L2.markerClusterGroup({ maxClusterRadius: 50 });
        pois.forEach((el) => {
          const pos = getLatLng(el);
          if (!pos) return;
          const name = el.tags?.name || el.tags?.shop || 'POI';
          L.marker(pos, { icon: poiIcon }).bindPopup(`<b>${name}</b>`).addTo(poiCluster);
        });
        map.addLayer(poiCluster);
        groups.push(poiCluster);
      }

      if (showFuel && fuelStations.length) {
        const fuelCluster = L2.markerClusterGroup({ maxClusterRadius: 40 });
        fuelStations.forEach((el) => {
          const name = el.tags?.name || 'Posto de combustível';
          const brand = el.tags?.brand || '';
          L.marker([el.lat, el.lon], { icon: fuelIcon })
            .bindPopup(`<b>${name}</b>${brand ? `<br/>${brand}` : ''}<br/><em>Candidato a retrofit EV</em>`)
            .addTo(fuelCluster);
        });
        map.addLayer(fuelCluster);
        groups.push(fuelCluster);
      }
    });

    return () => { cancelled = true; groups.forEach((g) => map.removeLayer(g)); };
  }, [map, pois, fuelStations, showPois, showFuel]);

  return null;
}
