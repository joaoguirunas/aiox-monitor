'use client';

/**
 * useCardRealtime — hook por AgentChatNode para consumir eventos realtime.
 *
 * Responsabilidades:
 *  1. Retorna status da conexão WS via RealtimeContext
 *  2. Deriva isStreaming + lastStreamingId do conversationsStore
 *     (o RealtimeProvider já escreveu lá via appendChunk)
 *  3. Subscreve diretamente ao WsClient para efeitos locais do card:
 *     - chat.chunk  → filtra por conversationId → scroll-to-bottom
 *     - agent.status → filtra por cardId → sinaliza transição visual
 *     - message.new  → filtra por conversationId → marca entrega ("chat.done")
 *
 * Nota sobre dupla-escrita:
 *   O RealtimeProvider já chama appendChunk / markDelivered / patchNodeStatus
 *   para TODOS os eventos. Este hook NÃO duplica essas chamadas — ele usa
 *   uma assinatura separada exclusivamente para efeitos colaterais locais
 *   (callbacks onChunk / onDelivered / onStatusChange).
 *
 * Uso:
 *   const { realtimeStatus, isStreaming, lastStreamingId } = useCardRealtime(cardId);
 *
 * Story 9.8 / JOB-048
 */

import { useEffect, useRef, useMemo, useCallback } from 'react';
import { useRealtimeClient } from './RealtimeContext';
import type { WsEvent } from './events';
import { useConversationsStore } from '../store/conversationsStore';
import type { WsClientStatus } from './WsClient';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface CardRealtimeCallbacks {
  /** Chamado a cada chunk recebido para ESTE card (já aplicado no store) */
  onChunk?: (messageId: string, delta: string) => void;
  /** Chamado quando a mensagem final chega (streaming concluído) */
  onDelivered?: (messageId: string) => void;
  /** Chamado quando o status do agente muda */
  onStatusChange?: (status: string) => void;
}

export interface UseCardRealtimeResult {
  /** Status da conexão WS do canvas */
  realtimeStatus: WsClientStatus;
  /** Verdadeiro se existe alguma mensagem do agente com streaming=true nesta conversa */
  isStreaming: boolean;
  /** ID da última mensagem do agente em streaming (para o cursor piscante) */
  lastStreamingId: string | undefined;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * @param cardId — ID do card (= conversationId por convenção da Sala de Comando v2)
 * @param callbacks — callbacks opcionais para efeitos locais (scroll, animação)
 */
export function useCardRealtime(
  cardId: string,
  callbacks?: CardRealtimeCallbacks,
): UseCardRealtimeResult {
  const { client, status: realtimeStatus } = useRealtimeClient();

  // ── Derivar estado de streaming do store (RealtimeProvider já escreveu) ──

  const allMessages            = useConversationsStore((s) => s.messages);
  const messagesByConversation = useConversationsStore((s) => s.messagesByConversation);

  /**
   * ID da última mensagem do agente com streaming=true.
   * Percorre de trás pra frente — O(n), n pequeno (max HISTORY_WINDOW por card).
   * messageIds derivado dentro do memo para evitar warning exhaustive-deps.
   */
  const lastStreamingId = useMemo(() => {
    const ids = messagesByConversation[cardId] ?? [];
    for (let i = ids.length - 1; i >= 0; i--) {
      const msg = allMessages[ids[i]];
      if (msg?.streaming && msg.senderRole !== 'user') {
        return msg.id;
      }
    }
    return undefined;
  }, [cardId, messagesByConversation, allMessages]);

  const isStreaming = lastStreamingId !== undefined;

  // ── Callbacks ref (estável para evitar re-subscribe) ─────────────────────

  const cardIdRef   = useRef(cardId);
  cardIdRef.current = cardId;

  const cbRef   = useRef(callbacks);
  cbRef.current = callbacks;

  // ── Subscrição ao WsClient para efeitos locais ───────────────────────────
  // IMPORTANTE: não chama appendChunk / patchNodeStatus aqui —
  // o RealtimeProvider já faz isso para todos os cards.
  // Esta assinatura existe apenas para callbacks locais (scroll, animação, etc.)

  const handleEvent = useCallback((event: WsEvent) => {
    const id = cardIdRef.current;
    const cb = cbRef.current;
    if (!cb) return;

    switch (event.type) {
      case 'chat.chunk':
        if (event.conversationId === id) {
          cb.onChunk?.(event.messageId, event.delta);
        }
        break;

      case 'message.new':
        // "chat.done": stream finalizado, mensagem definitiva entregue
        if (event.conversationId === id) {
          cb.onDelivered?.(event.message.id);
        }
        break;

      case 'agent.status':
        if (event.cardId === id) {
          cb.onStatusChange?.(event.status);
        }
        break;

      default:
        break;
    }
  }, []); // cardIdRef e cbRef são estáveis

  useEffect(() => {
    if (!client) return;
    return client.subscribe(handleEvent);
  }, [client, handleEvent]);

  return { realtimeStatus, isStreaming, lastStreamingId };
}
