'use client';
import { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { minMaxNormalize } from '@/utils/normalize';
import { UF_CODE_TO_SIGLA } from '@/hooks/useIBGEData';
import type { IBGEGeoJSON } from '@/hooks/useIBGEData';
import type { FrotaRow } from '@/utils/gapAnalysis';
import type { Charger } from '@/hooks/useOpenChargeMap';

// sigla → código IBGE de 2 dígitos (inverso de UF_CODE_TO_SIGLA)
const UF_SIGLA_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(UF_CODE_TO_SIGLA).map(([code, sigla]) => [sigla, code])
);

export interface MunicipioScore {
  code: string;          // código IBGE de 7 dígitos
  nome: string;
  uf: string;
  pop: number;
  frotaEst: number;      // frota EV plug-in (ABVE real; ou estimada por população)
  frotaFonte: 'abve' | 'estimada';
  eletropostos: number;  // eletropostos (ABVE por município; fallback Open Charge Map)
  ac: number;            // pontos AC (ABVE) — 0 se sem dado
  dc: number;            // pontos DC (ABVE) — 0 se sem dado
  fonte: 'abve' | 'ocm' | 'nenhuma';
  gap: number;           // frotaEst / (eletropostos + 1)
  score: number;         // 0–1
  scorePercent: number;
}

interface UFMunicipioData {
  geojson: IBGEGeoJSON | null;
  popByCode: Record<string, { pop: number; nome: string }>;
}

// Cache por UF — evita refetch ao alternar estados.
const cache = new Map<string, UFMunicipioData>();

/** Remove acentos e baixa caixa, para casar nomes de cidade entre fontes (ABVE/IBGE/OCM). */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// ─── Eletropostos por município (ABVE) ────────────────────────────────────────
// CSV estático extraído do painel da ABVE (BI Eletropostos). Colunas:
//   municipio,uf,ac,dc,total
// Carregado uma única vez e indexado por `${UF}|${nome normalizado}`.

interface AbveEletro { ac: number; dc: number; total: number }
let abvePromise: Promise<Map<string, AbveEletro>> | null = null;

function loadAbveEletropostos(): Promise<Map<string, AbveEletro>> {
  if (!abvePromise) {
    abvePromise = fetch('/data/abve/eletropostos_por_municipio.csv')
      .then((r) => (r.ok ? r.text() : ''))
      .then((txt) => {
        const map = new Map<string, AbveEletro>();
        if (!txt) return map;
        const parsed = Papa.parse<Record<string, unknown>>(txt, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
        });
        for (const row of parsed.data) {
          const municipio = String(row.municipio ?? '').trim();
          const uf = String(row.uf ?? '').trim().toUpperCase();
          if (!municipio || !uf) continue;
          map.set(`${uf}|${norm(municipio)}`, {
            ac: Number(row.ac) || 0,
            dc: Number(row.dc) || 0,
            total: Number(row.total) || 0,
          });
        }
        return map;
      })
      .catch(() => new Map<string, AbveEletro>());
  }
  return abvePromise;
}

// ─── Frota EV por município (ABVE — BaseVendas) ───────────────────────────────
// CSV: municipio,uf,bev,phev,hev,mhev,hev_flex,ev_plugin,total
// Usamos `ev_plugin` (BEV+PHEV) como a frota que efetivamente recarrega.

interface AbveFrota { bev: number; phev: number; evPlugin: number; total: number }
let frotaPromise: Promise<Map<string, AbveFrota>> | null = null;

function loadAbveFrota(): Promise<Map<string, AbveFrota>> {
  if (!frotaPromise) {
    frotaPromise = fetch('/data/abve/frota_ev_por_municipio.csv')
      .then((r) => (r.ok ? r.text() : ''))
      .then((txt) => {
        const map = new Map<string, AbveFrota>();
        if (!txt) return map;
        const parsed = Papa.parse<Record<string, unknown>>(txt, {
          header: true, dynamicTyping: true, skipEmptyLines: true,
        });
        for (const row of parsed.data) {
          const municipio = String(row.municipio ?? '').trim();
          const uf = String(row.uf ?? '').trim().toUpperCase();
          if (!municipio || !uf) continue;
          map.set(`${uf}|${norm(municipio)}`, {
            bev: Number(row.bev) || 0,
            phev: Number(row.phev) || 0,
            evPlugin: Number(row.ev_plugin) || 0,
            total: Number(row.total) || 0,
          });
        }
        return map;
      })
      .catch(() => new Map<string, AbveFrota>());
  }
  return frotaPromise;
}

function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(id));
}

async function loadUF(ufId: string): Promise<UFMunicipioData> {
  const malhaUrl =
    `https://servicodados.ibge.gov.br/api/v3/malhas/estados/${ufId}` +
    `?formato=application/vnd.geo+json&intrarregiao=municipio&qualidade=intermediaria`;
  const popUrl =
    `https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/-1/variaveis/9324` +
    `?localidades=N6[N3[${ufId}]]`;

  const [geojson, popRaw] = await Promise.all([
    fetchWithTimeout(malhaUrl, 25_000).then((r) => {
      if (!r.ok) throw new Error(`IBGE malha HTTP ${r.status}`);
      return r.json() as Promise<IBGEGeoJSON>;
    }),
    fetchWithTimeout(popUrl, 25_000).then((r) => {
      if (!r.ok) throw new Error(`IBGE população HTTP ${r.status}`);
      return r.json();
    }),
  ]);

  const popByCode: Record<string, { pop: number; nome: string }> = {};
  const series = popRaw?.[0]?.resultados?.[0]?.series ?? [];
  for (const s of series) {
    const code: string = s?.localidade?.id;
    const rawNome: string = s?.localidade?.nome ?? '';
    const nome = rawNome.replace(/\s*-\s*[A-Z]{2}$/, '').trim(); // "Acrelândia - AC" → "Acrelândia"
    const serie = s?.serie ?? {};
    const latest = Object.values(serie).at(-1) as string | undefined;
    if (code) popByCode[code] = { pop: parseFloat(latest ?? '0') || 0, nome };
  }

  return { geojson, popByCode };
}

/**
 * Score de oportunidade por MUNICÍPIO para a UF selecionada.
 *
 * Fonte de dados:
 *  - Polígonos e população: IBGE (malhas + agregado 6579), buscados sob demanda.
 *  - Eletropostos: ABVE (CSV por município, BI Eletropostos) — muito mais atual
 *    que o Open Charge Map, que fica apenas como fallback quando a cidade não
 *    consta na base da ABVE.
 *  - Frota EV municipal: ESTIMADA distribuindo a frota EV do estado (ABVE, por UF)
 *    proporcionalmente à população de cada município (aproximação rotulada na UI).
 */
export function useMunicipioScore(
  uf: string,
  chargers: Charger[],
  frotasPorUF: FrotaRow[]
) {
  const [data, setData] = useState<UFMunicipioData | null>(
    uf ? cache.get(UF_SIGLA_TO_CODE[uf]) ?? null : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abveMap, setAbveMap] = useState<Map<string, AbveEletro>>(new Map());
  const [frotaMap, setFrotaMap] = useState<Map<string, AbveFrota>>(new Map());

  // Carrega as bases ABVE uma vez (cacheadas no módulo).
  useEffect(() => {
    let cancelled = false;
    loadAbveEletropostos().then((m) => { if (!cancelled) setAbveMap(m); });
    loadAbveFrota().then((m) => { if (!cancelled) setFrotaMap(m); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const ufId = UF_SIGLA_TO_CODE[uf];
    if (!uf || !ufId) {
      setData(null);
      setError(null);
      return;
    }
    const cached = cache.get(ufId);
    // Limpa o estado anterior imediatamente: sem isto, ao trocar para uma UF
    // ainda não carregada, o choropleth do estado anterior continua na tela
    // (com scores recalculados sobre os municípios errados) até o fetch terminar.
    setData(cached ?? null);
    if (cached) {
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadUF(ufId)
      .then((d) => {
        cache.set(ufId, d);
        if (!cancelled) { setData(d); setLoading(false); }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.name === 'AbortError' ? 'Timeout ao carregar municípios do IBGE.' : e.message);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [uf]);

  // Fallback: eletropostos por município (nome normalizado) a partir do OCM.
  const ocmByNome = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of chargers) {
      const town = (c.address?.split(',')[0] ?? '').trim();
      if (!town) continue;
      const key = norm(town);
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [chargers]);

  const { scoresByCode, top } = useMemo(() => {
    if (!data) return { scoresByCode: new Map<string, MunicipioScore>(), top: [] as MunicipioScore[] };

    const ufFleetRow = frotasPorUF.find((f) => f.uf === uf);
    const ufFleet =
      (ufFleetRow?.total_veiculos_ev ?? 0) + (ufFleetRow?.total_phev ?? 0);

    const entries = Object.entries(data.popByCode);
    const ufPopTotal = entries.reduce((sum, [, v]) => sum + v.pop, 0) || 1;

    // 1ª passada: monta inputs brutos
    const raw = entries.map(([code, { pop, nome }]) => {
      const key = `${uf}|${norm(nome)}`;

      // Frota EV: ABVE real (BEV+PHEV) quando disponível; senão estimada por população.
      const frota = frotaMap.get(key);
      const frotaEst = frota ? frota.evPlugin : ufFleet * (pop / ufPopTotal);
      const frotaFonte: MunicipioScore['frotaFonte'] = frota ? 'abve' : 'estimada';

      // Eletropostos: ABVE por município; fallback Open Charge Map.
      const abve = abveMap.get(key);
      let eletropostos: number, ac: number, dc: number, fonte: MunicipioScore['fonte'];
      if (abve) {
        eletropostos = abve.total; ac = abve.ac; dc = abve.dc; fonte = 'abve';
      } else {
        const ocm = ocmByNome.get(norm(nome)) ?? 0;
        eletropostos = ocm; ac = 0; dc = 0; fonte = ocm > 0 ? 'ocm' : 'nenhuma';
      }
      const gap = frotaEst / (eletropostos + 1);
      return { code, nome, pop, frotaEst, frotaFonte, eletropostos, ac, dc, fonte, gap };
    });

    // Normaliza dentro do estado
    const frotas = raw.map((r) => r.frotaEst);
    const gaps = raw.map((r) => r.gap);
    const [minF, maxF] = [Math.min(...frotas), Math.max(...frotas)];
    const [minG, maxG] = [Math.min(...gaps), Math.max(...gaps)];
    const W_MARKET = 1, W_GAP = 2, TOTAL = W_MARKET + W_GAP;

    const scored: MunicipioScore[] = raw.map((r) => {
      const score =
        (W_MARKET * minMaxNormalize(r.frotaEst, minF, maxF) +
          W_GAP * minMaxNormalize(r.gap, minG, maxG)) / TOTAL;
      return {
        ...r, uf,
        score,
        scorePercent: Math.round(score * 100),
      };
    });

    const byCode = new Map(scored.map((s) => [s.code, s]));
    const top = [...scored].sort((a, b) => b.score - a.score).slice(0, 10);
    return { scoresByCode: byCode, top };
  }, [data, abveMap, frotaMap, ocmByNome, frotasPorUF, uf]);

  return { geojson: data?.geojson ?? null, scoresByCode, top, loading, error };
}
