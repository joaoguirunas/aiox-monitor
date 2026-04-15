'use client';

/**
 * CommandRoomCanvas — Sala de Comando v2 · Story 9.1c
 *
 * Wrapper de topo que compõe:
 *   - CommandRoomProjectSelector (project manager UI)
 *   - React Flow canvas (nodes do canvasStore)
 *   - Empty state quando nenhum projeto está aberto
 *
 * NODE_TYPES declarado fora para referência estável (pitfall 3 §6.1).
 * deleteKeyCode={null} para não apagar nodes com Backspace (pitfall 4).
 */

import {
  useMemo,
  useCallback,
} from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type NodeTypes,
  type NodeChange,
  type EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useCanvasStore } from './store/canvasStore';
import { CommandRoomProjectSelector } from '../project-selector/CommandRoomProjectSelector';
import { AgentChatNode } from './AgentChatNode';
import { CommandPaletteGlobal } from './palette/CommandPaletteGlobal';

// Pitfall 3: NODE_TYPES fora do componente — referência estável
const NODE_TYPES: NodeTypes = {
  agentChatNode: AgentChatNode,
  // terminalNode: TerminalNode — adicionado em JOB-012 (Chewbacca merge 8.8)
};

// ─── Inner (dentro do Provider) ───────────────────────────────────────────────

function CommandRoomCanvasInner() {
  const {
    nodes,
    edges,
    currentProjectPath,
    catalogLoading,
    addNode: _addNode,
    removeNode,
    addEdge: _addEdge,
    removeEdge,
  } = useCanvasStore();

  // Pitfall 3: setNodes/setEdges via applyChanges para preservar estado interno dos nodes
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Aplica mudanças de posição/seleção sem reconstruir data
      const updated = applyNodeChanges(changes, nodes as Parameters<typeof applyNodeChanges>[1]);
      // Sincroniza remoções com o store
      const removed = changes.filter((c) => c.type === 'remove');
      removed.forEach((c) => removeNode((c as { id: string }).id));
      // Para drag/select não precisamos atualizar o store — o RF gerencia localmente
      void updated;
    },
    [nodes, removeNode],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      applyEdgeChanges(changes, edges as Parameters<typeof applyEdgeChanges>[1]);
      const removed = changes.filter((c) => c.type === 'remove');
      removed.forEach((c) => removeEdge((c as { id: string }).id));
    },
    [edges, removeEdge],
  );

  // AgentChatNode controla suas próprias dimensões internamente (collapse/expand §1).
  // Apenas o dragHandle é injetado aqui; width/height ficam a cargo do componente.
  const styledNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        dragHandle: '.chat-drag-handle',
      })),
    [nodes],
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* ── Barra de projeto (overlay no topo do canvas) ───────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <CommandRoomProjectSelector />

        {/* Badge de status do catálogo */}
        {currentProjectPath && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11,
              color: catalogLoading
                ? 'var(--sc-warning, #F59E0B)'
                : 'var(--sc-text-subtle, #6B7280)',
              background: 'rgba(12,14,20,0.75)',
              backdropFilter: 'blur(8px)',
              padding: '3px 8px',
              borderRadius: 6,
              border: '1px solid var(--sc-surface-300, #262B36)',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: catalogLoading
                  ? 'var(--sc-warning, #F59E0B)'
                  : 'var(--sc-success, #10B981)',
                display: 'inline-block',
                animation: catalogLoading ? 'sc-dot-pulse 1s ease-in-out infinite' : 'none',
              }}
            />
            {catalogLoading ? 'Carregando catálogo…' : 'Catálogo pronto'}
          </div>
        )}
      </div>

      {/* ── React Flow canvas ─────────────────────────────────────────────── */}
      <ReactFlow
        nodes={styledNodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        nodeTypes={NODE_TYPES}
        fitView={nodes.length > 0}
        fitViewOptions={{ padding: 0.2, maxZoom: 0.9 }}
        minZoom={0.15}
        maxZoom={1.5}
        // Pitfall 4: deleteKeyCode={null} — Backspace/Delete não apaga nodes
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
        style={{ flex: 1, background: 'var(--sc-surface-0, #0E1014)' }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="rgba(244,244,232,0.05)"
        />
        <Controls
          style={{
            background: 'var(--sc-surface-100, #15181F)',
            border: '1px solid var(--sc-surface-300, #262B36)',
            borderRadius: 8,
          }}
        />
        <MiniMap
          maskColor="rgba(0,0,0,0.55)"
          style={{
            background: 'var(--sc-surface-100, #15181F)',
            border: '1px solid var(--sc-surface-300, #262B36)',
            borderRadius: 8,
          }}
        />
      </ReactFlow>

      {/* ── Empty state: nenhum projeto aberto ────────────────────────────── */}
      {!currentProjectPath && nodes.length === 0 && (
        <EmptyState />
      )}

      {/* ── ⌘K Palette global — montada dentro do Provider para ter acesso
           ao ReactFlow context se necessário; renderiza via portal em <body> */}
      <CommandPaletteGlobal />
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        gap: 16,
      }}
    >
      <div
        style={{
          fontSize: 40,
          opacity: 0.15,
          lineHeight: 1,
        }}
      >
        🧘
      </div>
      <div
        style={{
          color: 'var(--sc-text-subtle, #6B7280)',
          fontSize: 13,
          textAlign: 'center',
          lineHeight: 1.6,
        }}
      >
        Abra um projeto para invocar agentes
        <br />
        <span style={{ fontSize: 11, color: 'var(--sc-text-subtle, #6B7280)', opacity: 0.7 }}>
          Use o seletor no canto superior esquerdo
        </span>
      </div>
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function CommandRoomCanvas() {
  return (
    <ReactFlowProvider>
      <CommandRoomCanvasInner />
    </ReactFlowProvider>
  );
}
