declare module 'leaflet' {
  interface HeatLayerOptions {
    minOpacity?: number;
    maxZoom?: number;
    max?: number;
    radius?: number;
    blur?: number;
    gradient?: Record<number, string>;
  }

  class HeatLayer extends Layer {
    constructor(latlngs: Array<[number, number, number?]>, options?: HeatLayerOptions);
    setLatLngs(latlngs: Array<[number, number, number?]>): this;
    addLatLng(latlng: [number, number, number?]): this;
    setOptions(options: HeatLayerOptions): this;
    redraw(): this;
    addTo(map: Map | LayerGroup): this;
    remove(): this;
    onAdd(map: Map): this;
    onRemove(map: Map): this;
  }

  function heatLayer(
    latlngs: Array<[number, number, number?]>,
    options?: HeatLayerOptions
  ): HeatLayer;
}

declare module 'leaflet.heat' {}

