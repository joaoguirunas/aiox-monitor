import { useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { TerminalNodeData } from './TerminalNode';

type TerminalSize = 'sm' | 'md' | 'lg';

const SIZE_DIMS: Record<TerminalSize, { width: number; height: number }> = {
  sm: { width: 300, height: 200 },
  md: { width: 500, height: 350 },
  lg: { width: 700, height: 500 },
};

// Minimal terminal shape required by this hook
export interface CanvasTerminal {
  id: string;
  agentName: string;
  linkedTerminalIds: string[];
  is_chief?: boolean;
}

const GAP_X = 24;
const GAP_Y = 60;
const DRAG_STRIP_HEIGHT = 8;
const COLS = 3;

function computePositions(terminals: CanvasTerminal[]): Map<string, { x: number; y: number; size: TerminalSize }> {
  const positions = new Map<string, { x: number; y: number; size: TerminalSize }>();
  const chief = terminals.find((t) => t.is_chief);
  const others = terminals.filter((t) => !t.is_chief);

  if (chief) {
    const { width } = SIZE_DIMS.lg;
    positions.set(chief.id, { x: Math.max(0, (COLS * (SIZE_DIMS.md.width + GAP_X) - width) / 2), y: 20, size: 'lg' });
  }

  const chiefHeight = chief ? SIZE_DIMS.lg.height + DRAG_STRIP_HEIGHT + GAP_Y : 0;
  const rowStartY = 20 + chiefHeight;

  others.forEach((t, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = col * (SIZE_DIMS.md.width + GAP_X);
    const y = rowStartY + row * (SIZE_DIMS.md.height + DRAG_STRIP_HEIGHT + GAP_Y);
    positions.set(t.id, { x, y, size: 'md' });
  });

  return positions;
}

export function useCanvasLayout(
  terminals: CanvasTerminal[],
  nodeData: (id: string) => Omit<TerminalNodeData, 'size'>,
): { nodes: Node<TerminalNodeData>[]; edges: Edge[] } {
  return useMemo(() => {
    const posMap = computePositions(terminals);

    const nodes: Node<TerminalNodeData>[] = terminals.map((t) => {
      const pos = posMap.get(t.id) ?? { x: 0, y: 0, size: 'md' as TerminalSize };
      const dims = SIZE_DIMS[pos.size];
      return {
        id: t.id,
        type: 'terminalNode',
        position: { x: pos.x, y: pos.y },
        dragHandle: '.terminal-drag-handle',
        style: { width: dims.width, height: dims.height + DRAG_STRIP_HEIGHT },
        data: { ...nodeData(t.id), size: pos.size } as TerminalNodeData,
      };
    });

    const edgeSet = new Set<string>();
    const edges: Edge[] = [];

    terminals.forEach((t) => {
      t.linkedTerminalIds.forEach((targetId) => {
        const key = [t.id, targetId].sort().join('→');
        if (edgeSet.has(key)) return;
        edgeSet.add(key);
        edges.push({
          id: `edge-${t.id}-${targetId}`,
          source: t.id,
          target: targetId,
          type: 'smoothstep',
          animated: true,
          style: { stroke: 'rgba(255,68,0,0.5)', strokeWidth: 1.5 },
        });
      });
    });

    return { nodes, edges };
  }, [terminals, nodeData]);
}
