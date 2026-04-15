/**
 * /command-room/spike-states — Fixture de regressão visual (JOB-033)
 *
 * Rota exclusiva para E2E. Renderiza AgentChatNode nos 4 estados:
 * idle · thinking · speaking · offline
 *
 * NÃO tem backend, WS nem persistência.
 * Usado por: tests/e2e/epic-9/visual-states.spec.ts
 */

import { SpikeStatesCanvas } from '@/components/command-room/canvas/SpikeStatesCanvas';

export const metadata = {
  title: 'Spike States · Regressão Visual — Sala de Comando v2',
};

export default function SpikeStatesPage() {
  return (
    <main style={{ height: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column' }}>
      {/* Banner identificador */}
      <div
        style={{
          padding: '6px 16px',
          background: 'rgba(99,102,241,0.08)',
          borderBottom: '1px solid rgba(99,102,241,0.18)',
          fontSize: 12,
          color: '#9BA1AD',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span style={{ color: '#818CF8', fontWeight: 600 }}>🎭 VISUAL STATES</span>
        <span>Fixture de regressão visual — idle · thinking · speaking · offline</span>
        <span style={{ marginLeft: 'auto', color: '#6B7280' }}>JOB-033 · E2E only</span>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <SpikeStatesCanvas />
      </div>
    </main>
  );
}
