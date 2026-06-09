'use client';
import { useState, useEffect, useMemo } from 'react';
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
  frotaEst: number;      // frota EV estimada (proporcional à população do estado)
  eletropostos: number;  // eletropostos contados via Open Charge Map
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

/** Remove acentos e baixa caixa, para casar nomes de cidade do OCM com o IBGE. */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
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
 *  - Eletropostos: contados a partir do Open Charge Map (campo cidade).
 *  - Frota EV municipal: ESTIMADA distribuindo a frota EV do estado (ABVE, por UF)
 *    proporcionalmente à população de cada município. É uma aproximação — a
 *    fonte municipal exata (SENATRAN/ABVE) pode substituir esta estimativa
 *    bastando popular `frota_por_municipio` no futuro.
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

  useEffect(() => {
    const ufId = UF_SIGLA_TO_CODE[uf];
    if (!uf || !ufId) {
      setData(null);
      setError(null);
      return;
    }
    const cached = cache.get(ufId);
    if (cached) {
      setData(cached);
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

  // Eletropostos por município (nome normalizado) a partir do OCM
  const eletropostosByNome = useMemo(() => {
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
      const frotaEst = ufFleet * (pop / ufPopTotal);
      const eletropostos = eletropostosByNome.get(norm(nome)) ?? 0;
      const gap = frotaEst / (eletropostos + 1);
      return { code, nome, pop, frotaEst, eletropostos, gap };
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
  }, [data, eletropostosByNome, frotasPorUF, uf]);

  return { geojson: data?.geojson ?? null, scoresByCode, top, loading, error };
}
