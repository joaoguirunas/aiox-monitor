'use client';

/**
 * SpikeStatesCanvas — Fixture para regressão visual (JOB-033)
 *
 * Canvas isolado que renderiza 4 AgentChatNodes, um para cada
 * estado visual possível: idle · thinking · speaking · offline
 *
 * Rota: /command-room/spike-states
 * Uso: exclusivamente por tests/e2e/epic-9/visual-states.spec.ts
 *
 * NÃO tem persistência, WS nem backend real.
 */

import { useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  type NodeTypes,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { AgentChatNode, type AgentChatNodeData } from './AgentChatNode';

// NODE_TYPES fora do componente — referência estável (pitfall 3 §6.1)
const NODE_TYPES: NodeTypes = {
  agentChatNode: AgentChatNode,
};

// ─── Mock nodes — 4 estados ────────────────────────────────────────────────────

const STATES_NODES: Node<AgentChatNodeData>[] = [
  {
    id: 'agent-idle',
    type: 'agentChatNode',
    position: { x: 60, y: 60 },
    dragHandle: '.chat-drag-handle',
    data: {
      agentName: 'Agent-Idle',
      agentRole: 'Estado: idle',
      accentColor: '#6366f1',
      avatarIcon: '🤖',
      status: 'idle',
    },
  },
  {
    id: 'agent-thinking',
    type: 'agentChatNode',
    position: { x: 500, y: 60 },
    dragHandle: '.chat-drag-handle',
    data: {
      agentName: 'Agent-Thinking',
      agentRole: 'Estado: thinking',
      accentColor: '#fbbf24',
      avatarIcon: '🧠',
      status: 'thinking',
    },
  },
  {
    id: 'agent-speaking',
    type: 'agentChatNode',
    position: { x: 60, y: 420 },
    dragHandle: '.chat-drag-handle',
    data: {
      agentName: 'Agent-Speaking',
      agentRole: 'Estado: speaking',
      accentColor: '#34d399',
      avatarIcon: '🎙️',
      status: 'speaking',
    },
  },
  {
    id: 'agent-offline',
    type: 'agentChatNode',
    position: { x: 500, y: 420 },
    dragHandle: '.chat-drag-handle',
    data: {
      agentName: 'Agent-Offline',
      agentRole: 'Estado: offline',
      accentColor: '#374151',
      avatarIcon: '💤',
      status: 'offline',
    },
  },
];

// ─── Inner (dentro do ReactFlowProvider) ─────────────────────────────────────

function SpikeStatesCanvasInner() {
  const nodes = useMemo(() => STATES_NODES, []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={[]}
      nodeTypes={NODE_TYPES}
      fitView
      fitViewOptions={{ padding: 0.15, maxZoom: 0.85 }}
      minZoom={0.2}
      maxZoom={1.5}
      deleteKeyCode={null}
      proOptions={{ hideAttribution: true }}
      style={{ background: '#0E1014', height: '100%' }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color="rgba(244,244,232,0.05)"
      />
    </ReactFlow>
  );
}

// ─── Export ────────────────────────────────────────────────────────────────────

export function SpikeStatesCanvas() {
  return (
    <ReactFlowProvider>
      <SpikeStatesCanvasInner />
    </ReactFlowProvider>
  );
}
