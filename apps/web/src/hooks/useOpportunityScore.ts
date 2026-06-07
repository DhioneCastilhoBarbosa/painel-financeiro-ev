'use client';
import { useMemo } from 'react';
import { calcularGapABVE } from '@/utils/gapAnalysis';
import { calcularOpportunityScores } from '@/utils/scoring';
import type { ScoreWeights, UFScoreInput } from '@/utils/scoring';
import type { FrotaRow, EletropostoRow } from '@/utils/gapAnalysis';
import type { IncomeByUF } from '@/hooks/useIBGEData';
import type { Charger } from '@/hooks/useOpenChargeMap';

export const UF_CENTROIDS: Record<string, [number, number]> = {
  AC: [-9.0238, -70.812],
  AL: [-9.5713, -36.782],
  AM: [-4.4197, -63.5806],
  AP: [1.4102, -51.7703],
  BA: [-12.5797, -41.7007],
  CE: [-5.4984, -39.3206],
  DF: [-15.7998, -47.8645],
  ES: [-19.1834, -40.3089],
  GO: [-15.827, -49.8362],
  MA: [-4.9609, -45.2744],
  MG: [-18.5122, -44.555],
  MS: [-20.7722, -54.7852],
  MT: [-12.6819, -56.9211],
  PA: [-3.4168, -52.2865],
  PB: [-7.24, -36.782],
  PE: [-8.8137, -36.9541],
  PI: [-7.7183, -42.7289],
  PR: [-24.9896, -51.9225],
  RJ: [-22.9068, -43.1729],
  RN: [-5.8127, -36.2089],
  RO: [-11.5057, -63.5806],
  RR: [1.9905, -61.3302],
  RS: [-30.0346, -53.1999],
  SC: [-27.2423, -50.2189],
  SE: [-10.5741, -37.3857],
  SP: [-23.5505, -46.6333],
  TO: [-10.1753, -48.2982],
};

// Approximate highway density proxy by UF (0–100 arbitrary index)
const FLUXO_VIARIO: Record<string, number> = {
  SP: 100, RJ: 85, MG: 70, PR: 65, SC: 60, RS: 62, DF: 55, GO: 50,
  ES: 45, BA: 40, CE: 35, PE: 38, MT: 30, MS: 32, PA: 20, AM: 15,
  MA: 22, PI: 18, TO: 20, RO: 18, RN: 25, PB: 22, AL: 20, SE: 23,
  AC: 10, AP: 8, RR: 8,
};

export function useOpportunityScore(
  incomeByUF: IncomeByUF,
  frotasPorUF: FrotaRow[],
  eletropostosPorUF: EletropostoRow[],
  chargers: Charger[],
  weights: ScoreWeights
) {
  const gapScores = useMemo(
    () => calcularGapABVE(frotasPorUF, eletropostosPorUF),
    [frotasPorUF, eletropostosPorUF]
  );

  const gapByUF = useMemo(
    () => new Map(gapScores.map((g) => [g.uf, g])),
    [gapScores]
  );

  const scores = useMemo(() => {
    if (!frotasPorUF.length) return [];

    const frotaMap = new Map(frotasPorUF.map((f) => [f.uf, f]));

    const inputs: UFScoreInput[] = Object.entries(UF_CENTROIDS).map(
      ([uf, centroid]) => {
        const frota = frotaMap.get(uf);
        const gap = gapByUF.get(uf);

        const nearbyChargerCount = chargers.filter(
          (c) =>
            Math.abs(c.lat - centroid[0]) < 2.5 &&
            Math.abs(c.lng - centroid[1]) < 2.5
        ).length;

        return {
          uf,
          nome: frota?.nome_estado ?? uf,
          centroid,
          renda: incomeByUF[uf] ?? 0,
          frota: (frota?.total_veiculos_ev ?? 0) + (frota?.total_phev ?? 0),
          densidadePois: 50,
          distanciaCarregadorMin: nearbyChargerCount > 0 ? 0 : 1,
          fluxoViario: FLUXO_VIARIO[uf] ?? 20,
          gapAbve: gap?.gapIndex ?? 0,
        };
      }
    );

    return calcularOpportunityScores(inputs, weights);
  }, [incomeByUF, frotasPorUF, gapByUF, chargers, weights]);

  return { scores, gapScores, top10: scores.slice(0, 10) };
}
