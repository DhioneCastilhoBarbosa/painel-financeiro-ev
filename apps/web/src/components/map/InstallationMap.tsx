'use client';
import { useState, useCallback, useEffect } from 'react';
import { MapContainer, TileLayer, useMapEvents, ZoomControl, useMap } from 'react-leaflet';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { useIBGEData } from '@/hooks/useIBGEData';
import { useABVEData } from '@/hooks/useABVEData';
import { useOpenChargeMap } from '@/hooks/useOpenChargeMap';
import { useOverpassData } from '@/hooks/useOverpassData';
import { useOpportunityScore, UF_CENTROIDS } from '@/hooks/useOpportunityScore';
import { DEFAULT_WEIGHTS } from '@/utils/scoring';
import type { ScoreWeights, UFScore } from '@/utils/scoring';

import { IncomeLayer } from './layers/IncomeLayer';
import { FleetLayer } from './layers/FleetLayer';
import { ABVEGapLayer } from './layers/ABVEGapLayer';
import { ChargerLayer, ChargerCoverageLayer } from './layers/ChargerLayer';
import { PoiLayer } from './layers/PoiLayer';
import { TrafficLayer } from './layers/TrafficLayer';
import { HeatmapLayer } from './layers/HeatmapLayer';
import { ScoreLayer } from './layers/ScoreLayer';
import { MapSidebar } from './MapSidebar';
import type { LayerVisibility } from './MapSidebar';

// Fix Leaflet default icon paths broken by webpack
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const INITIAL_CENTER = [-15.8, -47.9] as [number, number];
const INITIAL_ZOOM = 5;

const DEFAULT_LAYERS: LayerVisibility = {
  income: false,
  fleet: false,
  chargers: true,
  poi: false,
  fuel: false,
  traffic: false,
  abveGap: true,
  score: false,
  heatmap: false,
};

// Zooms the map when filterUF changes
function MapController({ filterUF }: { filterUF: string }) {
  const map = useMap();
  useEffect(() => {
    if (!filterUF) {
      map.flyTo(INITIAL_CENTER, INITIAL_ZOOM, { duration: 1.2 });
    } else {
      const centroid = UF_CENTROIDS[filterUF];
      if (centroid) map.flyTo(centroid, 7, { duration: 1.2 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterUF]);
  return null;
}

// Triggers Overpass fetch when map moves
function BoundsWatcher({ onBoundsChange }: {
  onBoundsChange: (s: number, w: number, n: number, e: number) => void;
}) {
  const map = useMapEvents({
    moveend() {
      const b = map.getBounds();
      onBoundsChange(b.getSouth(), b.getWest(), b.getNorth(), b.getEast());
    },
    zoomend() {
      const b = map.getBounds();
      onBoundsChange(b.getSouth(), b.getWest(), b.getNorth(), b.getEast());
    },
  });
  return null;
}

export default function InstallationMap() {
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);
  const [weights, setWeights] = useState<ScoreWeights>(DEFAULT_WEIGHTS);
  const [filterUF, setFilterUF] = useState('');

  const { geojson, incomeByUF, loading: ibgeLoading, error: ibgeError } = useIBGEData();
  const { frotasPorUF, eletropostosPorUF, loading: abveLoading } = useABVEData();
  const { chargers, usingMock } = useOpenChargeMap();
  const { data: overpass, fetchForBounds } = useOverpassData();

  const { scores, gapScores, top10 } = useOpportunityScore(
    incomeByUF,
    frotasPorUF,
    eletropostosPorUF,
    chargers,
    weights
  );

  const filteredScores = filterUF ? scores.filter((s) => s.uf === filterUF) : scores;
  const filteredTop10 = filterUF ? filteredScores.slice(0, 10) : top10;

  const handleBoundsChange = useCallback(
    (s: number, w: number, n: number, e: number) => {
      if (layers.poi || layers.fuel || layers.traffic) {
        fetchForBounds(s, w, n, e);
      }
    },
    [layers.poi, layers.fuel, layers.traffic, fetchForBounds]
  );

  // When a layer needing Overpass is first enabled, trigger immediate fetch
  const handleLayersChange = useCallback((next: LayerVisibility) => {
    setLayers(next);
  }, []);

  const handleExport = () => {
    const rows = [
      ['uf', 'nome', 'lat', 'lng', 'score', 'renda', 'frota', 'eletropostos', 'gap_abve'],
      ...filteredScores.map((s) => {
        const eletro = eletropostosPorUF.find((e) => e.uf === s.uf);
        return [
          s.uf, s.nome,
          s.centroid[0], s.centroid[1],
          s.scorePercent, s.inputs.renda, s.inputs.frota,
          eletro?.total_eletropostos ?? 0, s.inputs.gapAbve,
        ];
      }),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `locais_oportunidade_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSelectUF = (_score: UFScore) => { /* popup handles display */ };

  // GeoJSON layers need the IBGE polygons — show them only after load
  const geoReady = !!geojson;

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      {/* Non-blocking loading indicator (top-left chip) */}
      {(ibgeLoading || abveLoading) && (
        <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2 bg-white/90 border border-gray-200 rounded-full px-3 py-1.5 shadow text-xs text-gray-600">
          <span className="w-3 h-3 border-2 border-[#06CB3F] border-t-transparent rounded-full animate-spin inline-block" />
          {ibgeLoading ? 'Carregando mapa do IBGE…' : 'Carregando dados ABVE…'}
        </div>
      )}

      {/* IBGE API error (non-blocking) */}
      {ibgeError && (
        <div className="absolute top-3 left-3 z-[1000] bg-red-50 border border-red-300 text-red-700 text-xs rounded-lg px-3 py-2 max-w-xs">
          ⚠ IBGE indisponível: choropleth desativado. {ibgeError}
        </div>
      )}

      {/* Mock data notice */}
      {usingMock && !ibgeLoading && (
        <div className="absolute bottom-10 left-3 z-[1000] bg-amber-50 border border-amber-300 text-amber-700 text-xs rounded-lg px-3 py-2">
          ⚡ Eletropostos: demonstração. Configure <code className="font-mono">NEXT_PUBLIC_OPEN_CHARGE_MAP_KEY</code>.
        </div>
      )}

      {/* Map — always visible, no blocking overlay */}
      {/* @ts-expect-error react-leaflet v4 types */}
      <MapContainer
        center={INITIAL_CENTER}
        zoom={INITIAL_ZOOM}
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        {/* @ts-expect-error react-leaflet v4 types */}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          maxZoom={18}
        />
        <ZoomControl position="bottomright" />
        <BoundsWatcher onBoundsChange={handleBoundsChange} />
        <MapController filterUF={filterUF} />

        {/* Choropleth layers — need IBGE GeoJSON */}
        {geoReady && layers.income && Object.keys(incomeByUF).length > 0 && (
          <IncomeLayer geojson={geojson!} incomeByUF={incomeByUF} />
        )}
        {geoReady && layers.fleet && frotasPorUF.length > 0 && (
          <FleetLayer geojson={geojson!} frotasPorUF={frotasPorUF} />
        )}
        {/* ABVEGap shows circles immediately (no geojson needed), upgradesn to choropleth when IBGE loads */}
        {layers.abveGap && gapScores.length > 0 && (
          <ABVEGapLayer geojson={geojson} gapScores={gapScores} />
        )}
        {geoReady && layers.score && filteredScores.length > 0 && (
          <ScoreLayer geojson={geojson!} scores={filteredScores} onSelectUF={handleSelectUF} />
        )}
        {layers.heatmap && filteredScores.length > 0 && (
          <HeatmapLayer scores={filteredScores} />
        )}

        {/* Point layers — always available */}
        {layers.chargers && <ChargerLayer chargers={chargers} />}
        {layers.chargers && <ChargerCoverageLayer chargers={chargers} />}

        {/* Overpass layers (dynamic by bbox) */}
        <PoiLayer
          pois={overpass.pois}
          fuelStations={overpass.fuelStations}
          showPois={layers.poi}
          showFuel={layers.fuel}
        />
        {layers.traffic && <TrafficLayer highways={overpass.highways} />}
      </MapContainer>

      {/* Control panel */}
      <MapSidebar
        layers={layers}
        onLayersChange={handleLayersChange}
        weights={weights}
        onWeightsChange={setWeights}
        top10={filteredTop10}
        allScores={scores}
        onExport={handleExport}
        filterUF={filterUF}
        onFilterUFChange={setFilterUF}
        ibgeLoading={ibgeLoading}
        abveLoading={abveLoading}
      />
    </div>
  );
}
