'use client';

/**
 * SpikeCanvas — Spike 9.0
 *
 * Canvas isolado para validar AgentChatNode.
 * Rota: /command-room/spike (NÃO interfere em /command-room atual).
 *
 * NODE_TYPES: registra agentChatNode aqui.
 * Quando TerminalPanel estiver disponível no branch, o TerminalNode existente
 * em CanvasView.tsx será expandido com: agentChatNode: AgentChatNode.
 *
 * Pitfall 4 (ReactFlow): deleteKeyCode={null} — Backspace/Delete não apaga nodes.
 * O AgentChatNode também faz e.stopPropagation() no input como defesa dupla.
 */

import { useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type NodeTypes,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { AgentChatNode, type AgentChatNodeData } from './AgentChatNode';

// ─── Pitfall 3: NODE_TYPES definido FORA do componente (referência estável) ──
// Se definido dentro, o objeto recria a cada render → ReactFlow remonta todos os nodes.
const NODE_TYPES: NodeTypes = {
  // agentChatNode: novo tipo (spike 9.0)
  agentChatNode: AgentChatNode,
  // terminalNode será adicionado aqui em §6.2 quando TerminalPanel estiver disponível
  // terminalNode: TerminalNode,
};

// ─── Mock data — 2 cards + 1 aresta ──────────────────────────────────────────

const MOCK_NODES: Node<AgentChatNodeData>[] = [
  {
    id: 'luke',
    type: 'agentChatNode',
    position: { x: 80, y: 140 },
    dragHandle: '.chat-drag-handle',
    data: {
      agentName: 'Luke',
      agentRole: 'Dev Alpha · Frontend',
      accentColor: '#FACC15',
      avatarIcon: '💻',
      status: 'idle',
    },
  },
  {
    id: 'yoda',
    type: 'agentChatNode',
    position: { x: 540, y: 140 },
    dragHandle: '.chat-drag-handle',
    data: {
      agentName: 'Yoda',
      agentRole: 'Chief · Squad Orchestrator',
      accentColor: '#84CC16',
      avatarIcon: '🧘',
      status: 'thinking',
    },
  },
];

const MOCK_EDGES: Edge[] = [
  {
    id: 'edge-luke-yoda',
    source: 'luke',
    target: 'yoda',
    type: 'smoothstep',
    animated: true,
    label: 'delegation',
    style: { stroke: 'rgba(132,204,22,0.45)', strokeWidth: 1.5 },
    labelStyle: { fill: '#9BA1AD', fontSize: 10 },
    labelBgStyle: { fill: '#1C2029' },
  },
];

// ─── Inner component (precisa estar dentro do ReactFlowProvider) ───────────────

function SpikeCanvasInner() {
  // Pitfall 3: nodes/edges em useMemo — estáveis enquanto não mudam (spike estático)
  const nodes = useMemo(() => MOCK_NODES, []);
  const edges = useMemo(() => MOCK_EDGES, []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 0.9 }}
      minZoom={0.2}
      maxZoom={1.5}
      // Pitfall 4: deleteKeyCode={null} — impede que Backspace/Delete apague nodes
      deleteKeyCode={null}
      proOptions={{ hideAttribution: true }}
      style={{ background: '#0E1014' }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color="rgba(244,244,232,0.05)"
      />
      <Controls
        style={{
          background: '#15181F',
          border: '1px solid #262B36',
          borderRadius: 8,
        }}
      />
      <MiniMap
        nodeColor={(node) => {
          const data = node.data as AgentChatNodeData;
          return data.accentColor ?? '#6366f1';
        }}
        maskColor="rgba(0,0,0,0.55)"
        style={{
          background: '#15181F',
          border: '1px solid #262B36',
          borderRadius: 8,
        }}
      />
    </ReactFlow>
  );
}

// ─── Export ────────────────────────────────────────────────────────────────────

export function SpikeCanvas() {
  return (
    <ReactFlowProvider>
      <SpikeCanvasInner />
    </ReactFlowProvider>
  );
}
