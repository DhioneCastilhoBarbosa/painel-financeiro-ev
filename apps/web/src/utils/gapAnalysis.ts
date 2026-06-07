export interface FrotaRow {
  uf: string;
  nome_estado: string;
  total_veiculos_ev: number;
  total_hibridos: number;
  total_phev: number;
  ano_referencia: number;
}

export interface EletropostoRow {
  uf: string;
  nome_estado: string;
  total_eletropostos: number;
  pontos_ac: number;
  pontos_dc: number;
  pontos_rapido: number;
  ano_referencia: number;
}

export type GapClassificacao = 'critico' | 'alto' | 'moderado' | 'saturado';

export interface GapScore {
  uf: string;
  nome: string;
  totalEV: number;
  totalEletropostos: number;
  ratioVeiculosPorPonto: number;
  gapIndex: number;
  classificacao: GapClassificacao;
}

function classificarGap(ratio: number): GapClassificacao {
  if (ratio > 200) return 'critico';
  if (ratio > 100) return 'alto';
  if (ratio > 50) return 'moderado';
  return 'saturado';
}

export function calcularGapABVE(
  frotasPorUF: FrotaRow[],
  eletropostosPorUF: EletropostoRow[]
): GapScore[] {
  const eletroMap = new Map(eletropostosPorUF.map((e) => [e.uf, e]));

  const scores = frotasPorUF.map((frota) => {
    const eletro = eletroMap.get(frota.uf);
    const totalEV = (frota.total_veiculos_ev || 0) + (frota.total_phev || 0);
    const totalEletropostos = Math.max(eletro?.total_eletropostos || 0, 1);
    const ratio = totalEV / totalEletropostos;

    return {
      uf: frota.uf,
      nome: frota.nome_estado,
      totalEV,
      totalEletropostos: eletro?.total_eletropostos || 0,
      ratioVeiculosPorPonto: ratio,
      gapIndex: 0,
      classificacao: classificarGap(ratio),
    };
  });

  const ratios = scores.map((s) => s.ratioVeiculosPorPonto);
  const minRatio = Math.min(...ratios);
  const maxRatio = Math.max(...ratios);

  return scores
    .map((s) => ({
      ...s,
      gapIndex:
        maxRatio === minRatio
          ? 50
          : Math.round(
              ((s.ratioVeiculosPorPonto - minRatio) / (maxRatio - minRatio)) * 100
            ),
    }))
    .sort((a, b) => b.gapIndex - a.gapIndex);
}

export const GAP_COLORS: Record<GapClassificacao, string> = {
  critico: '#d73027',
  alto: '#fc8d59',
  moderado: '#fee090',
  saturado: '#1a9850',
};
