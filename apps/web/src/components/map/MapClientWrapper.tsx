'use client';
import dynamic from 'next/dynamic';
import { PlanGate } from '@/components/PlanGate';

const InstallationMap = dynamic(
  () => import('./InstallationMap'),
  { ssr: false }
);

export function MapClientWrapper() {
  return (
    <PlanGate feature="map_view">
      <InstallationMap />
    </PlanGate>
  );
}
