'use client';

import dynamic from 'next/dynamic';
import { NAVBAR_HEIGHT } from '@/game/constants';

const PhaserGame = dynamic(
  () => import('@/components/empresa/PhaserGame').then((m) => m.PhaserGame),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex items-center justify-center bg-[#1a1a2e]"
        style={{ height: `calc(100vh - ${NAVBAR_HEIGHT}px)` }}
      >
        <p className="text-gray-500 font-mono text-sm">Inicializando Phaser...</p>
      </div>
    ),
  },
);

export default function EmpresaPage() {
  return <PhaserGame />;
}
