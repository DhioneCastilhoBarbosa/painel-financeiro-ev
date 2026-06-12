/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Lns from 'leaflet';

// Plugins do Leaflet (leaflet.heat, leaflet.markercluster) anexam suas funções
// (`heatLayer`, `markerClusterGroup`) no objeto `L` GLOBAL. Porém `import * as L
// from 'leaflet'` devolve um namespace ESM IMUTÁVEL — os plugins não conseguem
// anexar nada nele, então as funções ficam `undefined` (e quebram o mapa).
//
// Solução: publicar em `window.L` uma cópia MUTÁVEL do Leaflet (mantém as
// classes/métodos core por referência) ANTES de importar os plugins, e usar
// esse objeto para chamar as funções dos plugins.

let ready: Promise<any> | null = null;

export function ensureLeafletPlugins(): Promise<any> {
  if (typeof window === 'undefined') return Promise.resolve(Lns as any);
  if (!ready) {
    ready = (async () => {
      const w = window as any;
      // Garante um L global mutável (o namespace ESM é congelado/não-extensível).
      if (!w.L || Object.isFrozen(w.L) || !Object.isExtensible(w.L)) {
        w.L = Object.assign({}, Lns);
      }
      try { await import('leaflet.heat'); } catch { /* opcional */ }
      try { await import('leaflet.markercluster'); } catch { /* opcional */ }
      return w.L;
    })();
  }
  return ready;
}
