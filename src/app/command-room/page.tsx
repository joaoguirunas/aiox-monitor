/**
 * /command-room — Sala de Comando v2
 *
 * Página principal da Sala de Comando v2.
 * Project Manager UI (story 9.1c) + canvas React Flow.
 * Integra CommandRoomProjectSelector no topo do canvas.
 */

import { CommandRoomCanvas } from '@/components/command-room/canvas/CommandRoomCanvas';

export const metadata = {
  title: 'Sala de Comando — AIOX Monitor',
};

export default function CommandRoomPage() {
  return (
    <main style={{ height: 'calc(100vh - 44px)', display: 'flex', flexDirection: 'column' }}>
      <CommandRoomCanvas />
    </main>
  );
}
