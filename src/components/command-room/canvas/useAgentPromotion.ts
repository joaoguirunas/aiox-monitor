'use client';

/**
 * useAgentPromotion — hook para promover um AgentCard de chat → hybrid (PTY).
 *
 * Story 9.6 / JOB-038
 *
 * Dispara POST /api/agents/:cardId/promote e, enquanto aguarda resposta,
 * sinaliza loading no canvasStore via patchNodeStatus('thinking').
 * Ao concluir, restaura status original via patchNodeStatus('idle').
 *
 * O backend (promote.ts) escreve no DB; o frontend espera que o WS
 * broadcast 'agent.status' confirme a mudança de estado real (Story 9.7+).
 * Por ora o hook atualiza o store localmente após resposta 200.
 *
 * Uso:
 *   const { promote, promoting } = useAgentPromotion(cardId);
 *   <button onClick={promote} disabled={promoting}>Promover para PTY</button>
 */

import { useState, useCallback, useRef } from 'react';
import { useCanvasStore } from './store/canvasStore';
import type { AgentStatus } from './store/canvasStore';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface PromoteSuccess {
  success: true;
  cardId: string;
  newKind: 'hybrid';
  stubTerminalId: string;
}

export interface PromoteNoop {
  success: false;
  reason: 'already_promoted' | 'card_not_found';
  cardId: string;
}

type PromoteResponse = PromoteSuccess | PromoteNoop;

export interface UseAgentPromotionResult {
  /** Inicia a promoção. Idempotente: noop se já em progresso. */
  promote: () => Promise<void>;
  /** Verdadeiro enquanto o POST está em flight */
  promoting: boolean;
  /** Último erro de rede (null se nenhum) */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAgentPromotion(cardId: string): UseAgentPromotionResult {
  const [promoting, setPromoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const patchNodeStatus = useCanvasStore((s) => s.patchNodeStatus);

  /**
   * Lê o status atual do card para restaurar após a operação.
   * Lemos diretamente do store via getState() para não criar dependência
   * no useCallback (o status muda frequentemente, causaria re-render loop).
   */
  const getPriorStatus = useCallback((): AgentStatus => {
    const node = useCanvasStore.getState().nodes.find((n) => n.id === cardId);
    return (node?.data?.status as AgentStatus | undefined) ?? 'idle';
  }, [cardId]);

  const promote = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setError(null);

    const priorStatus = getPriorStatus();

    // Exibe loading state no card durante o POST
    patchNodeStatus(cardId, 'thinking');
    setPromoting(true);

    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(cardId)}/promote`, {
        method: 'POST',
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = (await res.json()) as PromoteResponse;

      if (!data.success) {
        // Já promovido ou não encontrado — restaura status silenciosamente
        patchNodeStatus(cardId, priorStatus);
        return;
      }

      // Promoção bem-sucedida: o WS irá confirmar com agent.status em breve.
      // Enquanto isso, muda o visual para 'waiting' (card híbrido aguardando PTY).
      patchNodeStatus(cardId, 'waiting');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(`Falha ao promover card: ${message}`);
      // Restaura status anterior em caso de erro de rede
      patchNodeStatus(cardId, priorStatus);
    } finally {
      setPromoting(false);
      inFlightRef.current = false;
    }
  }, [cardId, patchNodeStatus, getPriorStatus]);

  return { promote, promoting, error };
}
