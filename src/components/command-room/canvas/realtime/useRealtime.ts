'use client';

/**
 * useRealtime — hook React que conecta WsClient ao Zustand da Sala de Comando v2.
 *
 * Responsabilidades (mapeamento evento → ação de store):
 *
 *  | Evento WS             | Ação Zustand                            |
 *  |-----------------------|-----------------------------------------|
 *  | message.new           | conversationsStore.appendMessage        |
 *  | chat.chunk            | conversationsStore.appendChunk          |
 *  | agent.status          | canvasStore.patchNodeStatus             |
 *  | agent.added           | canvasStore.addNode                     |
 *  | agent.removed         | canvasStore.removeNode                  |
 *  | connection.added      | canvasStore.addEdge                     |
 *  | connection.removed    | canvasStore.removeEdge                  |
 *  | catalog.updated       | canvasStore.patchCatalog                |
 *  | catalog.reloaded      | canvasStore.setCatalog                  |
 *  | conversation.updated  | conversationsStore.upsertConversation   |
 *  | layout.patch          | canvasStore.patchLayout (viewport/pos)  |
 *
 * Design:
 *  - WsClient criado e destruído com o ciclo de vida do hook (uma instância por mount)
 *  - Estado de conexão (status) exposto para componentes de UI (badge de status)
 *  - Handlers de eventos são estáveis via useCallback / ref — sem re-subscribe loop
 *
 * Uso:
 *   const { status } = useRealtime();
 *   // Depois, leia os stores diretamente: useCanvasStore(), useConversationsStore()
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { WsClient, type WsClientStatus } from './WsClient';
import type { WsEvent } from './events';
import { useCanvasStore } from '../store/canvasStore';
import type { AgentCardNode, ConnectionEdge } from '../store/canvasStore';
import { useConversationsStore } from '../store/conversationsStore';

// ---------------------------------------------------------------------------
// Tipos do hook
// ---------------------------------------------------------------------------

export interface UseRealtimeOptions {
  /** Endpoint do servidor. Default: '/ws' */
  endpoint?: string;
  /** Habilita ou desabilita a conexão. Default: true */
  enabled?: boolean;
}

export interface UseRealtimeResult {
  /** Status atual da conexão WS */
  status: WsClientStatus;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRealtime(options: UseRealtimeOptions = {}): UseRealtimeResult {
  const { endpoint = '/ws', enabled = true } = options;

  const [status, setStatus] = useState<WsClientStatus>('disconnected');

  // Acessa os stores fora do handler para não capturar stale refs.
  // Usamos a forma selector-based para obter só as actions (referências estáveis).
  const patchNodeStatus = useCanvasStore((s) => s.patchNodeStatus);
  const addNode = useCanvasStore((s) => s.addNode);
  const removeNode = useCanvasStore((s) => s.removeNode);
  const addEdge = useCanvasStore((s) => s.addEdge);
  const removeEdge = useCanvasStore((s) => s.removeEdge);
  const patchLayout = useCanvasStore((s) => s.patchLayout);
  const setCatalog = useCanvasStore((s) => s.setCatalog);
  const patchCatalog = useCanvasStore((s) => s.patchCatalog);

  const appendMessage = useConversationsStore((s) => s.appendMessage);
  const appendChunk = useConversationsStore((s) => s.appendChunk);
  const upsertConversation = useConversationsStore((s) => s.upsertConversation);

  // Guarda actions em ref para evitar que o handler resubscreva ao mudar
  const actionsRef = useRef({
    patchNodeStatus,
    addNode,
    removeNode,
    addEdge,
    removeEdge,
    patchLayout,
    setCatalog,
    patchCatalog,
    appendMessage,
    appendChunk,
    upsertConversation,
  });
  // Mantém ref atualizada sem disparar efeito de reconexão
  actionsRef.current = {
    patchNodeStatus,
    addNode,
    removeNode,
    addEdge,
    removeEdge,
    patchLayout,
    setCatalog,
    patchCatalog,
    appendMessage,
    appendChunk,
    upsertConversation,
  };

  const handleEvent = useCallback((event: WsEvent) => {
    const a = actionsRef.current;

    switch (event.type) {
      // ── Mensagens ────────────────────────────────────────────────────────
      case 'message.new':
        a.appendMessage(event.message);
        break;

      case 'chat.chunk':
        a.appendChunk(
          event.messageId,
          event.conversationId,
          event.delta,
          event.senderId,
        );
        break;

      case 'conversation.updated':
        // Atualiza lastMessageAt da conversa sem sobrescrever outros campos
        a.upsertConversation({
          id: event.conversationId,
          kind: 'peer', // fallback — upsertConversation usa merge parcial
          userId: 'local',
          createdAt: event.at,
          lastMessageAt: event.lastMessageAt,
          participantIds: [],
        });
        break;

      // ── Agentes / cards ──────────────────────────────────────────────────
      case 'agent.status':
        a.patchNodeStatus(event.cardId, event.status);
        break;

      case 'agent.added': {
        const { nodeId, ...cardData } = event.card;
        const node: AgentCardNode = {
          id: nodeId,
          type: 'agent-card',
          position: { x: 0, y: 0 }, // backend deve enviar posição; default seguro
          data: cardData as AgentCardNode['data'],
        };
        a.addNode(node);
        break;
      }

      case 'agent.removed':
        a.removeNode(event.cardId);
        break;

      // ── Conexões / arestas ───────────────────────────────────────────────
      case 'connection.added': {
        const { edgeId, source, target, ...connData } = event.connection;
        const edge: ConnectionEdge = {
          id: edgeId,
          source,
          target,
          type: 'connection',
          data: connData as ConnectionEdge['data'],
        };
        a.addEdge(edge);
        break;
      }

      case 'connection.removed':
        a.removeEdge(event.id);
        break;

      // ── Layout ───────────────────────────────────────────────────────────
      case 'layout.patch':
        // Cada patch pode conter viewport ou posições de nodes.
        // patchLayout aceita Partial<CanvasLayout> — delegamos ao store o merge.
        for (const patch of event.patches) {
          if (patch.viewport) {
            a.patchLayout({ viewport: patch.viewport });
          }
          // Posições de nodes individuais são tratadas pelo React Flow onNodesChange;
          // layout.patch é usado principalmente para sincronização multi-tab.
        }
        break;

      // ── Catálogo de agentes ──────────────────────────────────────────────
      case 'catalog.updated':
        a.patchCatalog(event.added, event.removed);
        break;

      case 'catalog.reloaded':
        a.setCatalog(event.full);
        break;

      // ── PTY (apenas observado, não tratado aqui — TerminalNode lida) ─────
      case 'pty.frame':
        // Encaminhamento para handlers de PTY é feito diretamente nos TerminalNodes
        // via useWebSocket existente. useRealtime não interfere com PTY.
        break;

      // ── Heartbeat já filtrado em WsClient ───────────────────────────────
      case 'heartbeat':
        // nunca chega aqui — WsClient consome antes de repassar
        break;

      default:
        // Evento desconhecido — ignorar sem throw (forward-compatibility)
        break;
    }
  }, []); // actionsRef é estável; sem deps necessárias

  useEffect(() => {
    if (!enabled) return;

    const client = new WsClient({ endpoint, scope: 'canvas' });

    const unsubStatus = client.onStatusChange(setStatus);
    const unsubEvents = client.subscribe(handleEvent);

    client.connect();

    return () => {
      unsubStatus();
      unsubEvents();
      client.disconnect();
    };
  }, [enabled, endpoint, handleEvent]);

  return { status };
}
