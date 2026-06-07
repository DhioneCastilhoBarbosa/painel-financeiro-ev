'use client';
import dynamic from 'next/dynamic';

const InstallationMap = dynamic(
  () => import('./InstallationMap'),
  { ssr: false }
);

export function MapClientWrapper() {
  return <InstallationMap />;
}
