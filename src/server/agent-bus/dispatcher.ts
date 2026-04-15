/**
 * MessageDispatcher — JOB-046
 *
 * Central AgentBus dispatch logic. Handles:
 *   1. Authorization: sender must have outbound connection to target
 *   2. Depth guard: prevents infinite A→B→A chains
 *   3. Context injection: enriches prompt via context-injector
 *   4. Dispatch by kind:
 *        terminal/hybrid → maestri ask {terminalName} "{enrichedPrompt}"
 *        chat             → model stub (story 9.3 v1; real model in 9.9)
 *   5. Persistence: sender message + response message written to DB
 *   6. WS broadcast: chat.chunk per delta, message.new on completion
 *
 * Pure dependencies injected for testability:
 *   - db: DatabaseSync (defaults to global singleton)
 *   - ptyWriter: PtyWriter (defaults to maestriAsk)
 *   - broadcastFn: (WsMessage) => void (defaults to ws-broadcaster.broadcast)
 */

import type { DatabaseSync } from 'node:sqlite';
import { db as globalDb } from '../../lib/db';
import { buildAgentContext } from './context-injector';
import { depthGuard } from './depth-guard';
import { ensureRegistered, markBusy, markIdle } from './registry';
import { defaultPtyWriter, type PtyWriter } from './stdin-writer';
import { StreamAccumulator, stripAnsi } from './stdout-parser';
import { broadcast as globalBroadcast } from '../ws-broadcaster';
import type { WsMessage } from '../ws-broadcaster';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DispatchInput {
  /** The agent card that should RECEIVE the message (target). */
  targetCardId: string;
  /** The conversation this message belongs to. */
  conversationId: string;
  /** Message content from the sender. */
  content: string;
  /** The card (or 'user') that triggered the dispatch. */
  senderId: string | 'user';
  /** Role to record in messages table. */
  senderRole?: 'chief' | 'agent' | 'system' | 'tool';
}

export interface DispatchSuccess {
  ok: true;
  messageId: string;
  responseId: string;
  content: string;
}

export interface DispatchFailure {
  ok: false;
  reason: 'unauthorized' | 'depth_exceeded' | 'card_not_found' | 'no_terminal_name' | 'dispatch_error';
  detail?: string;
}

export type DispatchOutcome = DispatchSuccess | DispatchFailure;

export interface DispatcherOptions {
  db?: DatabaseSync;
  ptyWriter?: PtyWriter;
  broadcastFn?: (msg: WsMessage) => void;
}

// ─── Internal card row type ───────────────────────────────────────────────────

interface CardRow {
  id: string;
  display_name: string;
  kind: 'chat' | 'terminal' | 'hybrid';
  maestri_terminal_name: string | null;
  project_path: string | null;
  skill_path: string | null;
  is_chief: number;
  status: string;
}

// ─── Authorization ────────────────────────────────────────────────────────────

/**
 * Check whether `senderId` is authorized to dispatch to `targetCardId`.
 *
 * Authorization rules:
 *   1. senderId === 'user'  → always allowed (human operator)
 *   2. sender is_chief = 1 → always allowed (chief card has universal authority)
 *   3. Directed connection source_id=sender → target_id=target exists
 *   4. Undirected connection (directed=0) between the two cards
 */
function isAuthorized(
  senderId: string | 'user',
  targetCardId: string,
  db: DatabaseSync,
): boolean {
  if (senderId === 'user') return true;

  // Check if sender is a chief card
  const senderRow = db.prepare(
    `SELECT is_chief FROM agent_cards WHERE id = ?`
  ).get(senderId) as { is_chief: number } | undefined;

  if (senderRow?.is_chief === 1) return true;

  // Check for outbound directed connection
  const conn = db.prepare(`
    SELECT id FROM connections
    WHERE (
      (source_id = ? AND target_id = ?)
      OR (source_id = ? AND target_id = ? AND directed = 0)
      OR (source_id = ? AND target_id = ? AND directed = 0)
    )
    LIMIT 1
  `).get(senderId, targetCardId, senderId, targetCardId, targetCardId, senderId);

  return conn !== undefined;
}

// ─── Message persistence ──────────────────────────────────────────────────────

function persistMessage(
  db: DatabaseSync,
  conversationId: string,
  senderId: string | null,
  senderRole: string,
  content: string,
): string {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO messages (id, conversation_id, sender_id, sender_role, content)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, conversationId, senderId ?? null, senderRole, content);
  return id;
}

// ─── Chat stub (kind='chat', story 9.3 v1) ────────────────────────────────────

/**
 * Stub response for chat-kind cards.
 * Story 9.9 replaces this with actual Claude API call.
 */
async function chatStub(
  card: CardRow,
  enrichedPrompt: string,
  onChunk: (delta: string) => void,
): Promise<string> {
  const stub = `[${card.display_name} — stub v1]\n\nContexto recebido (${enrichedPrompt.length} chars). Integração real com modelo em Story 9.9.`;
  // Simulate streaming: emit in small chunks
  const chunks = stub.match(/.{1,40}/g) ?? [stub];
  for (const chunk of chunks) {
    onChunk(chunk);
    await new Promise(r => setTimeout(r, 10));
  }
  return stub;
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

/**
 * Dispatch a message to a target agent card.
 *
 * This is the single entry point for all inter-agent communication.
 */
export async function dispatch(
  input: DispatchInput,
  options: DispatcherOptions = {},
): Promise<DispatchOutcome> {
  const db = options.db ?? globalDb;
  const ptyWriter = options.ptyWriter ?? defaultPtyWriter;
  const broadcastFn = options.broadcastFn ?? globalBroadcast;

  const { targetCardId, conversationId, content, senderId, senderRole = 'agent' } = input;

  // ── 1. Load target card ───────────────────────────────────────────────────
  const card = db.prepare(`
    SELECT id, display_name, kind, maestri_terminal_name, project_path, skill_path, is_chief, status
    FROM agent_cards WHERE id = ?
  `).get(targetCardId) as unknown as CardRow | undefined;

  if (!card) {
    return { ok: false, reason: 'card_not_found', detail: `Card '${targetCardId}' not found` };
  }

  // Ensure card is registered in runtime registry
  ensureRegistered(card);

  // ── 2. Authorization ──────────────────────────────────────────────────────
  if (!isAuthorized(senderId, targetCardId, db)) {
    return {
      ok: false,
      reason: 'unauthorized',
      detail: `Sender '${senderId}' has no outbound connection to '${targetCardId}'`,
    };
  }

  // ── 3. Depth guard ────────────────────────────────────────────────────────
  const senderIdStr = senderId === 'user' ? 'user' : senderId;
  const depthResult = depthGuard.canDispatch(
    conversationId,
    senderIdStr,
    targetCardId,
    { isChief: senderId !== 'user' && (db.prepare(`SELECT is_chief FROM agent_cards WHERE id = ?`).get(senderId) as { is_chief: number } | undefined)?.is_chief === 1 },
  );

  if (!depthResult.ok) {
    return {
      ok: false,
      reason: 'depth_exceeded',
      detail: `Depth limit reached (${depthResult.depth}/${depthResult.depth - 1}): ${depthResult.reason}`,
    };
  }

  // ── 4. Persist incoming message ───────────────────────────────────────────
  const messageId = persistMessage(
    db,
    conversationId,
    senderId === 'user' ? null : senderId,
    senderRole,
    content,
  );

  broadcastFn({
    type: 'message.new',
    v: 1,
    conversationId,
    message: { id: messageId, sender_role: senderRole, content, created_at: new Date().toISOString() },
  });

  // ── 5. Build enriched context ─────────────────────────────────────────────
  let enrichedContext: string;
  try {
    enrichedContext = buildAgentContext(targetCardId, conversationId, db);
  } catch {
    enrichedContext = content; // graceful fallback: send raw content
  }

  const fullPrompt = [enrichedContext, `\n\n---\nMensagem recebida:\n${content}`].join('');

  // ── 6. Record dispatch hop ────────────────────────────────────────────────
  depthGuard.markDispatched(conversationId, senderIdStr, targetCardId);
  markBusy(targetCardId);

  // ── 7. Dispatch by kind ───────────────────────────────────────────────────
  let responseContent = '';
  let dispatchError: string | undefined;

  try {
    const acc = new StreamAccumulator();

    acc.onEvent = (event) => {
      if (event.type === 'chunk') {
        broadcastFn({
          type: 'chat.chunk',
          v: 1,
          conversationId,
          cardId: targetCardId,
          delta: stripAnsi(event.delta),
        });
        responseContent += stripAnsi(event.delta);
      }
    };

    if (card.kind === 'terminal' || card.kind === 'hybrid') {
      if (!card.maestri_terminal_name) {
        return {
          ok: false,
          reason: 'no_terminal_name',
          detail: `Card '${targetCardId}' has no maestri_terminal_name set`,
        };
      }

      const result = await ptyWriter(
        card.maestri_terminal_name,
        fullPrompt,
        (chunk) => acc.push(chunk),
      );

      if (!result.ok) {
        dispatchError = result.error;
      }

      acc.flush();

    } else {
      // kind === 'chat' — stub
      responseContent = await chatStub(card, fullPrompt, (delta) => {
        broadcastFn({
          type: 'chat.chunk',
          v: 1,
          conversationId,
          cardId: targetCardId,
          delta,
        });
      });
    }

  } finally {
    markIdle(targetCardId);
  }

  if (dispatchError) {
    return { ok: false, reason: 'dispatch_error', detail: dispatchError };
  }

  // ── 8. Persist response ───────────────────────────────────────────────────
  const responseId = persistMessage(
    db,
    conversationId,
    targetCardId,
    'agent',
    responseContent || '(sem resposta)',
  );

  broadcastFn({
    type: 'message.new',
    v: 1,
    conversationId,
    message: {
      id: responseId,
      sender_role: 'agent',
      content: responseContent,
      created_at: new Date().toISOString(),
    },
  });

  return { ok: true, messageId, responseId, content: responseContent };
}
