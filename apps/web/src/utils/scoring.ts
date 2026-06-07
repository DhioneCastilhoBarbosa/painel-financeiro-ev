import { minMaxNormalize } from './normalize';

export interface ScoreWeights {
  w1: number; // renda
  w2: number; // frota
  w3: number; // densidade POIs
  w4: number; // distância ao carregador mais próximo (invertida)
  w5: number; // fluxo viário
  w6: number; // gap ABVE
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  w1: 1,
  w2: 2,
  w3: 1,
  w4: 2,
  w5: 1,
  w6: 3,
};

export interface UFScoreInput {
  uf: string;
  nome: string;
  centroid: [number, number];
  renda: number;
  frota: number;
  densidadePois: number;
  distanciaCarregadorMin: number;
  fluxoViario: number;
  gapAbve: number;
}

export interface UFScore {
  uf: string;
  nome: string;
  centroid: [number, number];
  score: number;
  scorePercent: number;
  inputs: UFScoreInput;
}

function scoreToColor(score: number): string {
  if (score >= 0.8) return '#bd0026';
  if (score >= 0.6) return '#f03b20';
  if (score >= 0.4) return '#fd8d3c';
  if (score >= 0.2) return '#fecc5c';
  return '#ffffb2';
}

export { scoreToColor };

export function calcularOpportunityScores(
  inputs: UFScoreInput[],
  weights: ScoreWeights
): UFScore[] {
  if (!inputs.length) return [];

  const extract = (fn: (i: UFScoreInput) => number) => inputs.map(fn);

  const rends = extract((i) => i.renda);
  const frotas = extract((i) => i.frota);
  const pois = extract((i) => i.densidadePois);
  const dists = extract((i) => i.distanciaCarregadorMin);
  const fluxos = extract((i) => i.fluxoViario);
  const gaps = extract((i) => i.gapAbve);

  const bounds = (arr: number[]) => [Math.min(...arr), Math.max(...arr)] as const;

  const [minR, maxR] = bounds(rends);
  const [minF, maxF] = bounds(frotas);
  const [minP, maxP] = bounds(pois);
  const [minD, maxD] = bounds(dists);
  const [minFl, maxFl] = bounds(fluxos);
  const [minG, maxG] = bounds(gaps);

  const totalW =
    weights.w1 + weights.w2 + weights.w3 + weights.w4 + weights.w5 + weights.w6 || 1;

  const scored = inputs.map((input) => {
    const rNorm = minMaxNormalize(input.renda, minR, maxR);
    const fNorm = minMaxNormalize(input.frota, minF, maxF);
    const pNorm = minMaxNormalize(input.densidadePois, minP, maxP);
    const dNorm = 1 - minMaxNormalize(input.distanciaCarregadorMin, minD, maxD);
    const flNorm = minMaxNormalize(input.fluxoViario, minFl, maxFl);
    const gNorm = minMaxNormalize(input.gapAbve, minG, maxG);

    const score =
      (weights.w1 * rNorm +
        weights.w2 * fNorm +
        weights.w3 * pNorm +
        weights.w4 * dNorm +
        weights.w5 * flNorm +
        weights.w6 * gNorm) /
      totalW;

    return {
      uf: input.uf,
      nome: input.nome,
      centroid: input.centroid,
      score,
      scorePercent: Math.round(score * 100),
      inputs: input,
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}
