/**
 * context-injector.ts — builds the enriched prompt for an agent turn.
 *
 * Entry point: `buildAgentContext(cardId, conversationId, db) → string`
 *
 * Assembles:
 *   1. Agent's own system_prompt (agent_cards.system_prompt)
 *   2. "Seus vizinhos neste canvas" block (§3.2b of master plan)
 *   3. Conversation history (last MAX_HISTORY messages, idx_msg_conv_created)
 *
 * Pure — no side effects, no singletons.  db is injected so tests use :memory:.
 * Regenerating on connection.added|removed is free: just call again next turn.
 *
 * Story 9.9 prep — wired into AgentBus dispatcher in Story 9.3.
 */

import type { DatabaseSync } from 'node:sqlite';

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_HISTORY = 20;

// ─── Internal types ───────────────────────────────────────────────────────────

interface AgentCardRow {
  id: string;
  display_name: string;
  aiox_agent: string | null;
  system_prompt: string | null;
  is_chief: number;
}

interface ConnectionRow {
  neighbor_id: string;
  display_name: string;
  aiox_agent: string | null;
  directed: number;
}

interface MessageRow {
  sender_role: string | null;
  sender_name: string | null;
  content: string;
}

// ─── Exported types ───────────────────────────────────────────────────────────

export type NeighborDirection = 'outbound' | 'inbound' | 'bidirectional';

export interface Neighbor {
  id: string;
  display_name: string;
  aiox_agent: string | null;
  direction: NeighborDirection;
}

// ─── Neighbor resolution ──────────────────────────────────────────────────────

/**
 * Load all neighbors for a card, merging outbound + inbound into a direction
 * per neighbor.  A neighbor reachable in both directions → 'bidirectional'.
 */
export function loadNeighbors(cardId: string, db: DatabaseSync): Neighbor[] {
  const outboundRows = db.prepare(`
    SELECT c.target_id AS neighbor_id,
           ac.display_name,
           ac.aiox_agent,
           c.directed
    FROM   connections c
    JOIN   agent_cards ac ON ac.id = c.target_id
    WHERE  c.source_id = ?
  `).all(cardId) as unknown as ConnectionRow[];

  const inboundRows = db.prepare(`
    SELECT c.source_id AS neighbor_id,
           ac.display_name,
           ac.aiox_agent,
           c.directed
    FROM   connections c
    JOIN   agent_cards ac ON ac.id = c.source_id
    WHERE  c.target_id = ?
  `).all(cardId) as unknown as ConnectionRow[];

  const map = new Map<string, Neighbor>();

  for (const row of outboundRows) {
    map.set(row.neighbor_id, {
      id: row.neighbor_id,
      display_name: row.display_name,
      aiox_agent: row.aiox_agent,
      direction: row.directed === 0 ? 'bidirectional' : 'outbound',
    });
  }

  for (const row of inboundRows) {
    const existing = map.get(row.neighbor_id);
    if (existing) {
      // Seen from outbound side too → bidirectional.
      existing.direction = 'bidirectional';
    } else {
      map.set(row.neighbor_id, {
        id: row.neighbor_id,
        display_name: row.display_name,
        aiox_agent: row.aiox_agent,
        direction: row.directed === 0 ? 'bidirectional' : 'inbound',
      });
    }
  }

  return [...map.values()];
}

// ─── Block builders ───────────────────────────────────────────────────────────

/** Format one neighbor line — exported for unit tests. */
export function formatNeighborLine(n: Neighbor): string {
  const label = n.aiox_agent ? `${n.display_name} (${n.aiox_agent})` : n.display_name;
  const dirLabel =
    n.direction === 'outbound'
      ? 'outbound: você pode mandar /ask'
      : n.direction === 'inbound'
        ? 'inbound: ele pode te delegar'
        : 'bidirectional';
  return `- ${label} — ${dirLabel}`;
}

/**
 * Build the "Seus vizinhos neste canvas" block per §3.2b.
 * Always regenerated from current DB state — no cache.
 */
export function buildNeighborsBlock(card: AgentCardRow, neighbors: Neighbor[]): string {
  const cardLabel = card.aiox_agent
    ? `${card.display_name} (${card.aiox_agent})`
    : card.display_name;

  const lines: string[] = [
    '## Seus vizinhos neste canvas',
    `Você é "${cardLabel}". Você está conectado a:`,
  ];

  if (neighbors.length === 0) {
    lines.push('(nenhum vizinho conectado)');
  } else {
    for (const n of neighbors) {
      lines.push(formatNeighborLine(n));
    }
  }

  lines.push(
    '',
    'Para falar com um vizinho: /ask @<nome> <mensagem>',
    'Para broadcast aos outbound: /broadcast <mensagem>',
    'Fora desses vizinhos, /ask retorna 403.',
  );

  return lines.join('\n');
}

// ─── History builder ──────────────────────────────────────────────────────────

/**
 * Load the last MAX_HISTORY messages of a conversation, ordered chronologically.
 * Uses idx_msg_conv_created for efficiency.
 */
function loadHistory(conversationId: string, db: DatabaseSync, limit = MAX_HISTORY): MessageRow[] {
  // Subquery: pick the N most-recent by created_at DESC, then re-sort ASC for display.
  return db.prepare(`
    SELECT m.sender_role,
           ac.display_name AS sender_name,
           m.content
    FROM (
      SELECT id, sender_id, sender_role, content
      FROM   messages
      WHERE  conversation_id = ?
      ORDER  BY created_at DESC
      LIMIT  ?
    ) m
    LEFT JOIN agent_cards ac ON ac.id = m.sender_id
    ORDER BY m.id ASC
  `).all(conversationId, limit) as unknown as MessageRow[];
}

/** Format conversation history into a plain-text block. */
function buildHistoryBlock(messages: MessageRow[]): string {
  if (messages.length === 0) return '';

  const lines = [`--- Histórico (últimas ${messages.length} mensagens) ---`];
  for (const msg of messages) {
    const rolePart = msg.sender_role ?? 'unknown';
    const namePart = msg.sender_name ?? rolePart;
    lines.push(`[${rolePart}] ${namePart}: ${msg.content}`);
  }
  return lines.join('\n');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build the full context string to inject before an agent turn.
 *
 * @param cardId        — agent_cards.id of the receiving agent
 * @param conversationId — active conversation
 * @param db            — DatabaseSync instance (injected for testability)
 * @returns             assembled prompt string
 */
export function buildAgentContext(
  cardId: string,
  conversationId: string,
  db: DatabaseSync,
): string {
  const card = db.prepare(`
    SELECT id, display_name, aiox_agent, system_prompt, is_chief
    FROM   agent_cards
    WHERE  id = ?
  `).get(cardId) as unknown as AgentCardRow | undefined;

  if (!card) {
    throw new Error(`agent_card not found: ${cardId}`);
  }

  const neighbors = loadNeighbors(cardId, db);
  const messages = loadHistory(conversationId, db);

  const parts: string[] = [];

  if (card.system_prompt?.trim()) {
    parts.push(card.system_prompt.trim());
  }

  parts.push(buildNeighborsBlock(card, neighbors));

  const history = buildHistoryBlock(messages);
  if (history) {
    parts.push(history);
  }

  return parts.join('\n\n');
}
