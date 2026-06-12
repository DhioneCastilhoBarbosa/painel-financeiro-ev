import type { Metadata } from 'next';
import { MapClientWrapper } from '@/components/map/MapClientWrapper';

export const metadata: Metadata = {
  title: 'Análise de Locais | Painel Financeiro EV',
  description: 'Identifique e ranqueie locais para instalação de carregadores EV.',
};

export default function MapPage() {
  return (
    <div style={{ height: 'calc(100dvh - 56px)', overflow: 'hidden', position: 'relative', zIndex: 0 }}>
      <MapClientWrapper />
    </div>
  );
}
