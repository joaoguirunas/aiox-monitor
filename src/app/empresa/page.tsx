'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { NAVBAR_HEIGHT } from '@/game/constants';
import { ListaPanel } from '@/components/realtime/ListaPanel';

const LISTA_WIDTH = 620;
const STORAGE_KEY = 'aiox-lista-collapsed';

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

export default function RealTimePage() {
  const [listaCollapsed, setListaCollapsed] = useState(true);

  // Persist collapsed state
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'false') setListaCollapsed(false);
  }, []);

  const toggleLista = useCallback(() => {
    setListaCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      // Trigger resize so Phaser adjusts its canvas
      setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
      return next;
    });
  }, []);

  return (
    <div
      className="relative flex w-full"
      style={{ height: `calc(100vh - ${NAVBAR_HEIGHT}px)` }}
    >
      {/* Left: Phaser Game — takes all available space */}
      <div className="flex-1 min-w-0 relative">
        <PhaserGame />
      </div>

      {/* Right: Lista Panel — collapsible */}
      <div
        className="shrink-0 relative transition-[width] duration-300 ease-in-out"
        style={{ width: listaCollapsed ? 0 : LISTA_WIDTH }}
      >
        <ListaPanel collapsed={listaCollapsed} onToggle={toggleLista} />
      </div>

      {/* Collapsed tab */}
      {listaCollapsed && (
        <button
          onClick={toggleLista}
          className="absolute right-0 top-4 z-20 flex flex-col items-center gap-2 px-2.5 py-4 rounded-l-xl bg-surface-1/95 border border-r-0 border-border/40 text-text-muted hover:text-text-primary hover:bg-surface-1 backdrop-blur-md transition-all shadow-xl shadow-black/20 hover:shadow-black/30 group"
          title="Abrir Activity Feed"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="group-hover:translate-x-[-2px] transition-transform">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span className="text-[9px] font-semibold tracking-wider uppercase [writing-mode:vertical-lr] rotate-180">Feed</span>
          <div className="w-1.5 h-1.5 rounded-full bg-accent-blue animate-pulse" />
        </button>
      )}
    </div>
  );
}
