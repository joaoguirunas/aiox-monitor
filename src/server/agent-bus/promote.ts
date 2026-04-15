/**
 * promote — lógica de promoção chat→PTY (Story 9.6 / JOB-038)
 *
 * v1: stub — não executa node-pty ainda. A integração real com `maestri ask`
 * vem na story 9.7. Aqui só:
 *  1. Valida estado atual do card
 *  2. Recupera histórico e formata prompt de continuação
 *  3. Cria stub de terminal
 *  4. Persiste kind = 'hybrid' + pty_terminal_id no DB
 *  5. Retorna { success, cardId, newKind, promptInjected }
 */

import { db } from '../../lib/db';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface PromoteResult {
  success: true;
  cardId: string;
  newKind: 'hybrid';
  /** Prompt de continuação injetado no stub PTY (para debug/log) */
  promptInjected: string;
  /** ID do stub de terminal criado */
  stubTerminalId: string;
}

export interface PromoteNoop {
  success: false;
  reason: 'already_promoted' | 'card_not_found';
  cardId: string;
}

export type PromoteOutcome = PromoteResult | PromoteNoop;

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Quantas mensagens recentes incluir no prompt de continuação */
const HISTORY_WINDOW = 20;

// ---------------------------------------------------------------------------
// Helpers: leitura do DB
// ---------------------------------------------------------------------------

interface AgentCardRow {
  id: string;
  kind: string;
  display_name: string;
  aiox_agent: string | null;
}

interface MessageRow {
  id: string;
  sender_role: string;
  content: string;
  created_at: string;
}

function getCard(cardId: string): AgentCardRow | null {
  const row = db
    .prepare('SELECT id, kind, display_name, aiox_agent FROM agent_cards WHERE id = ?')
    .get(cardId) as AgentCardRow | undefined;
  return row ?? null;
}

/**
 * Obtém as últimas `limit` mensagens da conversa associada ao card.
 *
 * Estratégia: usa cardId como conversationId (padrão definido em AgentChatNode
 * — cada card tem 1 conversa com id = cardId). Se não houver conversa criada
 * ainda, retorna lista vazia.
 */
function getRecentMessages(cardId: string, limit: number): MessageRow[] {
  const rows = db
    .prepare(
      `SELECT id, sender_role, content, created_at
       FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(cardId, limit) as unknown as MessageRow[];
  // Reverte para ordem cronológica ascendente
  return rows.reverse();
}

// ---------------------------------------------------------------------------
// Sumarizador de histórico → prompt de continuação
// ---------------------------------------------------------------------------

/**
 * Formata as últimas mensagens como um bloco de contexto para o PTY.
 *
 * Formato:
 *   === Contexto da conversa anterior ===
 *   [user] Olá, pode listar os arquivos?
 *   [agent] Claro! Aqui estão: ...
 *   === Fim do contexto — continue a partir daqui ===
 *
 * Mensagens de sistema/tool são omitidas do resumo (barulho).
 */
export function buildContinuationPrompt(
  agentName: string,
  messages: MessageRow[],
): string {
  if (messages.length === 0) {
    return `Você é ${agentName}. Esta sessão está sendo iniciada sem histórico anterior.`;
  }

  const lines = messages
    .filter((m) => m.sender_role === 'user' || m.sender_role === 'agent' || m.sender_role === 'chief')
    .map((m) => {
      const role = m.sender_role === 'user' ? 'user' : 'agent';
      const preview = m.content.length > 200
        ? m.content.slice(0, 200) + '…'
        : m.content;
      return `[${role}] ${preview}`;
    });

  return [
    `=== Contexto da conversa anterior com ${agentName} (${messages.length} mensagens) ===`,
    ...lines,
    `=== Fim do contexto — continue a conversa a partir daqui ===`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Stub de spawn PTY
// ---------------------------------------------------------------------------

/**
 * Cria um stub de terminal PTY.
 *
 * v1: não executa node-pty. Reserva o ID e registra nas tabelas existentes.
 * Story 9.7 vai trocar este stub pela integração real `maestri ask`.
 *
 * Retorna o ID do terminal stub (TEXT UUID-like).
 */
function spawnPtyStub(cardId: string, promptInjected: string): string {
  const stubId = `pty-stub-${cardId}-${Date.now()}`;

  // Insere um terminal stub na tabela `terminals` existente.
  // project_id = 0 (sentinel para "sem projeto associado" na v1 — stub).
  // pid = -1 indica terminal não real.
  db.prepare(
    `INSERT OR IGNORE INTO terminals
       (project_id, pid, session_id, status, agent_name, current_input, window_title)
     VALUES (1, -1, ?, 'inactive', ?, ?, ?)`,
  ).run(
    stubId,
    'pty-stub',
    promptInjected.slice(0, 500), // evita payload enorme no DB
    `Stub PTY — ${cardId}`,
  );

  return stubId;
}

// ---------------------------------------------------------------------------
// Função principal
// ---------------------------------------------------------------------------

/**
 * Promove um AgentCard de kind 'chat' para 'hybrid' (chat + PTY).
 *
 * - Se `kind` já é 'terminal' ou 'hybrid', retorna `PromoteNoop`.
 * - Recupera as últimas HISTORY_WINDOW mensagens da conversa do card.
 * - Cria stub de terminal PTY com o prompt de continuação.
 * - Persiste `kind = 'hybrid'` e `pty_terminal_id` no DB.
 */
export async function promoteToHybrid(cardId: string): Promise<PromoteOutcome> {
  const card = getCard(cardId);

  if (!card) {
    return { success: false, reason: 'card_not_found', cardId };
  }

  if (card.kind === 'terminal' || card.kind === 'hybrid') {
    return { success: false, reason: 'already_promoted', cardId };
  }

  // Recupera histórico recente
  const messages = getRecentMessages(cardId, HISTORY_WINDOW);
  const promptInjected = buildContinuationPrompt(card.display_name, messages);

  // Cria stub PTY
  const stubTerminalId = spawnPtyStub(cardId, promptInjected);

  // Persiste promoção no DB
  db.prepare(
    `UPDATE agent_cards
     SET kind = 'hybrid',
         pty_terminal_id = ?,
         last_active = datetime('now')
     WHERE id = ?`,
  ).run(stubTerminalId, cardId);

  return {
    success: true,
    cardId,
    newKind: 'hybrid',
    promptInjected,
    stubTerminalId,
  };
}
