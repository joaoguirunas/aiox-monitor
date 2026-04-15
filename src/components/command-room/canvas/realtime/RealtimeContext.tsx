'use client';

/**
 * RealtimeContext — provedor do WsClient compartilhado para a Sala de Comando v2.
 *
 * Arquitetura de 2 camadas:
 *
 *  ┌─────────────────────────────────────────────────────────┐
 *  │  RealtimeProvider (montado em CommandRoomCanvas)        │
 *  │  • 1 WsClient para todo o canvas                        │
 *  │  • Roteia TODOS os eventos WS → Zustand stores           │
 *  │  • Expõe client + status via contexto                   │
 *  └─────────────────────────────────────────────────────────┘
 *         ↓ contexto
 *  ┌──────────────────────────────────────┐
 *  │  useCardRealtime (por AgentChatNode) │
 *  │  • Lê streaming state do store       │
 *  │  • Subscreve a eventos per-card      │
 *  │  • Retorna { isStreaming, status }   │
 *  └──────────────────────────────────────┘
 *
 * Separação de responsabilidades:
 *  - RealtimeProvider: 1 conexão WS + writes globais no store
 *  - useCardRealtime:  leitura filtrada por card + efeitos locais
 *
 * Story 9.8 / JOB-048
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
import { WsClient, type WsClientStatus, type WsEventHandler } from './WsClient';
import type { WsEvent } from './events';
import { useCanvasStore } from '../store/canvasStore';
import type { AgentCardNode, ConnectionEdge } from '../store/canvasStore';
import { useConversationsStore } from '../store/conversationsStore';

// ---------------------------------------------------------------------------
// Contexto
// ---------------------------------------------------------------------------

export interface RealtimeContextValue {
  /** WsClient compartilhado — null até o Provider montar */
  client: WsClient | null;
  /** Status atual da conexão WS */
  status: WsClientStatus;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  client: null,
  status: 'disconnected',
});

/** Hook para consumir o contexto de realtime */
export function useRealtimeClient(): RealtimeContextValue {
  return useContext(RealtimeContext);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface RealtimeProviderProps {
  children: ReactNode;
  /** Endpoint WS. Default: '/ws' */
  endpoint?: string;
}

export function RealtimeProvider({
  children,
  endpoint = '/ws',
}: RealtimeProviderProps) {
  const [client, setClient] = useState<WsClient | null>(null);
  const [status, setStatus] = useState<WsClientStatus>('disconnected');

  // ── Ações do canvasStore ──────────────────────────────────────────────────
  const patchNodeStatus = useCanvasStore((s) => s.patchNodeStatus);
  const addNode         = useCanvasStore((s) => s.addNode);
  const removeNode      = useCanvasStore((s) => s.removeNode);
  const addEdge         = useCanvasStore((s) => s.addEdge);
  const removeEdge      = useCanvasStore((s) => s.removeEdge);
  const patchLayout     = useCanvasStore((s) => s.patchLayout);
  const setCatalog      = useCanvasStore((s) => s.setCatalog);
  const patchCatalog    = useCanvasStore((s) => s.patchCatalog);

  // ── Ações do conversationsStore ───────────────────────────────────────────
  const appendMessage      = useConversationsStore((s) => s.appendMessage);
  const appendChunk        = useConversationsStore((s) => s.appendChunk);
  const upsertConversation = useConversationsStore((s) => s.upsertConversation);
  const markDelivered      = useConversationsStore((s) => s.markDelivered);

  // Ref para evitar re-subscribe quando actions mudam de referência
  const actionsRef = useRef({
    patchNodeStatus, addNode, removeNode, addEdge, removeEdge,
    patchLayout, setCatalog, patchCatalog,
    appendMessage, appendChunk, upsertConversation, markDelivered,
  });
  actionsRef.current = {
    patchNodeStatus, addNode, removeNode, addEdge, removeEdge,
    patchLayout, setCatalog, patchCatalog,
    appendMessage, appendChunk, upsertConversation, markDelivered,
  };

  // ── Handler global — roteia todos os eventos WS → stores ─────────────────
  const handleGlobalEvent = useCallback<WsEventHandler>((event: WsEvent) => {
    const a = actionsRef.current;

    switch (event.type) {
      // ── Mensagens / streaming ───────────────────────────────────────────
      case 'chat.chunk':
        a.appendChunk(
          event.messageId,
          event.conversationId,
          event.delta,
          event.senderId,
        );
        break;

      case 'message.new':
        // "chat.done" semântico: finaliza qualquer stream pendente antes de
        // inserir a versão definitiva da mensagem.
        a.markDelivered(event.message.id);
        a.appendMessage(event.message);
        break;

      case 'conversation.updated':
        a.upsertConversation({
          id: event.conversationId,
          kind: 'peer',
          userId: 'local',
          createdAt: event.at,
          lastMessageAt: event.lastMessageAt,
          participantIds: [],
        });
        break;

      // ── Agentes / cards ─────────────────────────────────────────────────
      case 'agent.status':
        a.patchNodeStatus(event.cardId, event.status);
        break;

      case 'agent.added': {
        const { nodeId, ...cardData } = event.card;
        const node: AgentCardNode = {
          id: nodeId,
          type: 'agent-card',
          position: { x: 0, y: 0 },
          data: cardData as AgentCardNode['data'],
        };
        a.addNode(node);
        break;
      }

      case 'agent.removed':
        a.removeNode(event.cardId);
        break;

      // ── Conexões ─────────────────────────────────────────────────────────
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
        for (const patch of event.patches) {
          if (patch.viewport) {
            a.patchLayout({ viewport: patch.viewport });
          }
        }
        break;

      // ── Catálogo ─────────────────────────────────────────────────────────
      case 'catalog.updated':
        a.patchCatalog(event.added, event.removed);
        break;

      case 'catalog.reloaded':
        a.setCatalog(event.full);
        break;

      // ── Eventos ignorados no provider (PTY, heartbeat, project.*) ────────
      // project.opened / project.closed são tratados pelo ProjectManager via API
      // pty.frame é tratado diretamente pelos TerminalNodes
      // heartbeat é consumido no WsClient antes de chegar aqui
      default:
        break;
    }
  }, []); // actionsRef é estável — sem deps necessárias

  // ── Ciclo de vida do WsClient ─────────────────────────────────────────────
  useEffect(() => {
    const c = new WsClient({ endpoint, scope: 'canvas' });

    const unsubStatus = c.onStatusChange(setStatus);
    const unsubEvents = c.subscribe(handleGlobalEvent);

    c.connect();
    setClient(c); // expõe o client para useCardRealtime via contexto

    return () => {
      unsubStatus();
      unsubEvents();
      c.disconnect();
      setClient(null);
    };
  }, [endpoint, handleGlobalEvent]);

  return (
    <RealtimeContext.Provider value={{ client, status }}>
      {children}
    </RealtimeContext.Provider>
  );
}
