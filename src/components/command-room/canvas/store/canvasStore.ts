/**
 * canvasStore — Zustand slice para o canvas da Sala de Comando v2.
 *
 * State shape apenas: sem persistência, sem efeitos colaterais.
 * Persistência será adicionada em story posterior (canvas_layouts SQLite §3.1).
 *
 * Depende de: @xyflow/react (Node, Edge, Viewport tipagem)
 * Usado por: CanvasView, WsClient (via useRealtime)
 */

import { create } from 'zustand';
import type { Node, Edge, Viewport } from '@xyflow/react';

// ---------------------------------------------------------------------------
// Tipos de domínio (§3.1)
// ---------------------------------------------------------------------------

/** Status do agente — sincronizado via WS agent.status */
export type AgentStatus =
  | 'idle'
  | 'thinking'
  | 'speaking'
  | 'waiting'
  | 'offline'
  | 'error';

/** Tipo de card: chat-only, PTY terminal, ou híbrido */
export type AgentCardKind = 'chat' | 'terminal' | 'hybrid';

/** Payload de dados dentro do Node do React Flow */
export interface AgentCardData {
  /** UUID do card (agent_cards.id) */
  cardId: string;
  kind: AgentCardKind;
  displayName: string;
  /** Slug do agente AIOX (ex: 'chief', 'architect') */
  aioxAgent?: string;
  projectPath?: string;
  /** FK para command_room_terminals */
  ptyTerminalId?: string;
  /** Nome da instância no Maestri (para roteamento PTY) */
  maestriTerminalName?: string;
  categoryId?: string;
  isChief: boolean;
  status: AgentStatus;
  systemPrompt?: string;
  model?: string;
  userId: string;
  createdAt: string;
  lastActive: string;
}

/** Tipo concreto do Node para o canvas */
export type AgentCardNode = Node<AgentCardData & Record<string, unknown>, 'agent-card'>;

// ---------------------------------------------------------------------------
// Tipos de aresta (connections §3.1)
// ---------------------------------------------------------------------------

/** Tipo de conexão — define semântica de roteamento */
export type ConnectionKind = 'chat' | 'broadcast' | 'supervise' | 'context-share';

/** Payload de dados dentro da Edge do React Flow */
export interface ConnectionData {
  /** UUID da conexão (connections.id) */
  connectionId: string;
  directed: boolean;
  kind: ConnectionKind;
  label?: string;
  metadata?: Record<string, unknown>;
  userId: string;
  createdAt: string;
}

/** Tipo concreto da Edge para o canvas */
export type ConnectionEdge = Edge<ConnectionData & Record<string, unknown>, 'connection'>;

// ---------------------------------------------------------------------------
// Layout visual persistido (canvas_layouts §3.1)
// ---------------------------------------------------------------------------

/** Posição xy de um node no canvas */
export interface NodePosition {
  x: number;
  y: number;
}

/** Snapshot do layout de um projeto (source of truth: SQLite, aqui in-memory) */
export interface CanvasLayout {
  projectPath: string;
  viewport: Viewport;
  /** nodeId → posição */
  nodePositions: Record<string, NodePosition>;
  scenarioName?: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Estado do slice
// ---------------------------------------------------------------------------

export interface CanvasState {
  /** Nodes ativos no canvas (AgentCardNode[]) */
  nodes: AgentCardNode[];
  /** Arestas ativas (ConnectionEdge[]) */
  edges: ConnectionEdge[];
  /** Viewport atual do React Flow */
  viewport: Viewport;
  /** IDs dos nodes selecionados */
  selectedNodeIds: Set<string>;
  /** Layout carregado do projeto ativo */
  layout: CanvasLayout | null;
}

// ---------------------------------------------------------------------------
// Ações do slice
// ---------------------------------------------------------------------------

export interface CanvasActions {
  /** Adiciona um novo node ao canvas */
  addNode: (node: AgentCardNode) => void;
  /** Remove node por id — cascata remove edges conectadas */
  removeNode: (nodeId: string) => void;
  /** Adiciona uma aresta */
  addEdge: (edge: ConnectionEdge) => void;
  /** Remove aresta por id */
  removeEdge: (edgeId: string) => void;
  /** Atualiza o viewport (pan/zoom) */
  setViewport: (viewport: Viewport) => void;
  /** Merge parcial do layout (preserva campos não informados) */
  patchLayout: (patch: Partial<CanvasLayout>) => void;
  /** Define os nodes selecionados */
  setSelectedNodeIds: (ids: string[]) => void;
  /** Atualiza o status de um card específico */
  patchNodeStatus: (nodeId: string, status: AgentStatus) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useCanvasStore = create<CanvasState & CanvasActions>((set) => ({
  // Estado inicial
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  selectedNodeIds: new Set(),
  layout: null,

  // Ações
  addNode: (node) =>
    set((s) => ({ nodes: [...s.nodes, node] })),

  removeNode: (nodeId) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== nodeId),
      edges: s.edges.filter(
        (e) => e.source !== nodeId && e.target !== nodeId,
      ),
    })),

  addEdge: (edge) =>
    set((s) => ({ edges: [...s.edges, edge] })),

  removeEdge: (edgeId) =>
    set((s) => ({ edges: s.edges.filter((e) => e.id !== edgeId) })),

  setViewport: (viewport) => set({ viewport }),

  patchLayout: (patch) =>
    set((s) => ({
      layout: s.layout
        ? { ...s.layout, ...patch }
        : ({ ...patch } as CanvasLayout),
    })),

  setSelectedNodeIds: (ids) =>
    set({ selectedNodeIds: new Set(ids) }),

  patchNodeStatus: (nodeId, status) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, status } }
          : n,
      ),
    })),
}));
