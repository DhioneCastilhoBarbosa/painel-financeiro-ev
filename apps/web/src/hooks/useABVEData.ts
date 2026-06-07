'use client';
import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import type { FrotaRow, EletropostoRow } from '@/utils/gapAnalysis';

let frotasCache: FrotaRow[] | null = null;
let eletropostosCache: EletropostoRow[] | null = null;

export function useABVEData() {
  const [frotasPorUF, setFrotasPorUF] = useState<FrotaRow[]>(frotasCache ?? []);
  const [eletropostosPorUF, setEletropostosPorUF] = useState<EletropostoRow[]>(
    eletropostosCache ?? []
  );
  const [loading, setLoading] = useState(!frotasCache || !eletropostosCache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (frotasCache && eletropostosCache) return;

    Promise.all([
      fetch('/data/abve/frotas_ev_por_uf.csv').then((r) => r.text()),
      fetch('/data/abve/eletropostos_por_uf.csv').then((r) => r.text()),
    ])
      .then(([frotasCsv, eletropostosCsv]) => {
        const frotas = Papa.parse<FrotaRow>(frotasCsv, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
        });
        const eletropostos = Papa.parse<EletropostoRow>(eletropostosCsv, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
        });
        frotasCache = frotas.data;
        eletropostosCache = eletropostos.data;
        setFrotasPorUF(frotas.data);
        setEletropostosPorUF(eletropostos.data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return { frotasPorUF, eletropostosPorUF, loading, error };
}
