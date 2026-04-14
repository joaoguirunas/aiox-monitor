/**
 * /command-room/spike — Spike 9.0
 *
 * Rota isolada para validar AgentChatNode + React Flow.
 * NÃO toca em /command-room (legado).
 * NÃO tem persistência, WS nem backend real.
 */

import { SpikeCanvas } from '@/components/command-room/canvas/SpikeCanvas';

export const metadata = {
  title: 'Spike · AgentChatNode — Sala de Comando v2',
};

export default function SpikePage() {
  return (
    <main style={{ height: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column' }}>
      {/* Banner de aviso */}
      <div
        style={{
          padding: '6px 16px',
          background: 'rgba(250,204,21,0.08)',
          borderBottom: '1px solid rgba(250,204,21,0.18)',
          fontSize: 12,
          color: '#9BA1AD',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span style={{ color: '#FACC15', fontWeight: 600 }}>⚡ SPIKE 9.0</span>
        <span>AgentChatNode isolado — mock in-memory, sem WS real, sem persistência.</span>
        <span style={{ marginLeft: 'auto', color: '#6B7280' }}>
          Teste: drag · selecionar texto · digitar · deletar · scroll
        </span>
      </div>

      {/* Canvas ocupa o resto da altura */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <SpikeCanvas />
      </div>
    </main>
  );
}
