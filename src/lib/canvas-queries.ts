/**
 * Canvas queries — JOB-035
 * All DB operations for: agent_cards, connections, conversations,
 * conversation_participants, messages, canvas_layouts.
 *
 * Uses DatabaseSync (node:sqlite) — same pattern as queries.ts.
 */

import { db } from './db';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentKind = 'chat' | 'terminal' | 'hybrid';
export type AgentStatus = 'idle' | 'thinking' | 'speaking' | 'waiting' | 'offline' | 'error';
export type ConnectionKind = 'chat' | 'broadcast' | 'supervise' | 'context-share';
export type ConversationKind = 'peer' | 'group' | 'broadcast' | 'chief-thread';
export type ParticipantRole = 'member' | 'owner' | 'observer';
export type SenderRole = 'chief' | 'agent' | 'system' | 'tool';

export interface AgentCard {
  id: string;
  kind: AgentKind;
  display_name: string;
  aiox_agent: string | null;
  project_path: string | null;
  pty_terminal_id: string | null;
  category_id: string | null;
  is_chief: number;
  status: AgentStatus;
  system_prompt: string | null;
  model: string | null;
  user_id: string;
  created_at: string;
  last_active: string;
  maestri_terminal_name: string | null;
  skill_path: string | null;
}

export interface Connection {
  id: string;
  source_id: string;
  target_id: string;
  directed: number;
  kind: ConnectionKind | null;
  label: string | null;
  metadata: string | null;
  user_id: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  kind: ConversationKind | null;
  title: string | null;
  user_id: string;
  created_at: string;
  last_message_at: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  sender_role: SenderRole;
  content: string;
  artifacts: string | null;
  in_reply_to: string | null;
  created_at: string;
}

export interface CanvasLayout {
  project_path: string;
  viewport: string;
  node_positions: string;
  updated_at: string;
}

// ─── Agent Cards ──────────────────────────────────────────────────────────────

export interface CreateAgentCardInput {
  kind: AgentKind;
  display_name: string;
  aiox_agent?: string;
  project_path?: string;
  skill_path?: string;
  is_chief?: boolean;
  system_prompt?: string;
  model?: string;
  maestri_terminal_name?: string;
}

export function createAgentCard(input: CreateAgentCardInput): AgentCard {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO agent_cards
      (id, kind, display_name, aiox_agent, project_path, skill_path, is_chief,
       system_prompt, model, maestri_terminal_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.kind,
    input.display_name,
    input.aiox_agent ?? null,
    input.project_path ?? null,
    input.skill_path ?? null,
    input.is_chief ? 1 : 0,
    input.system_prompt ?? null,
    input.model ?? null,
    input.maestri_terminal_name ?? null,
  );
  return getAgentCard(id)!;
}

export function getAgentCard(id: string): AgentCard | undefined {
  return db.prepare(`SELECT * FROM agent_cards WHERE id = ?`).get(id) as AgentCard | undefined;
}

export function listAgentCards(projectPath: string): AgentCard[] {
  return db.prepare(
    `SELECT * FROM agent_cards WHERE project_path = ? ORDER BY created_at ASC`
  ).all(projectPath) as unknown as AgentCard[];
}

export interface UpdateAgentCardInput {
  display_name?: string;
  kind?: AgentKind;
  status?: AgentStatus;
  pty_terminal_id?: string | null;
  maestri_terminal_name?: string | null;
  system_prompt?: string | null;
  model?: string | null;
  skill_path?: string | null;
}

export function updateAgentCard(id: string, input: UpdateAgentCardInput): AgentCard | undefined {
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (input.display_name !== undefined) { fields.push('display_name = ?'); values.push(input.display_name); }
  if (input.kind !== undefined) { fields.push('kind = ?'); values.push(input.kind); }
  if (input.status !== undefined) { fields.push('status = ?'); values.push(input.status); }
  if (input.pty_terminal_id !== undefined) { fields.push('pty_terminal_id = ?'); values.push(input.pty_terminal_id); }
  if (input.maestri_terminal_name !== undefined) { fields.push('maestri_terminal_name = ?'); values.push(input.maestri_terminal_name); }
  if (input.system_prompt !== undefined) { fields.push('system_prompt = ?'); values.push(input.system_prompt); }
  if (input.model !== undefined) { fields.push('model = ?'); values.push(input.model); }
  if (input.skill_path !== undefined) { fields.push('skill_path = ?'); values.push(input.skill_path); }

  if (fields.length === 0) return getAgentCard(id);

  fields.push('last_active = datetime(\'now\')');
  values.push(id);

  db.prepare(`UPDATE agent_cards SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getAgentCard(id);
}

export function deleteAgentCard(id: string): boolean {
  const r = db.prepare(`DELETE FROM agent_cards WHERE id = ?`).run(id);
  return r.changes > 0;
}

// ─── Connections ──────────────────────────────────────────────────────────────

export interface CreateConnectionInput {
  source_id: string;
  target_id: string;
  kind?: ConnectionKind;
  directed?: boolean;
  label?: string;
  metadata?: Record<string, unknown>;
}

export function createConnection(input: CreateConnectionInput): Connection {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO connections (id, source_id, target_id, kind, directed, label, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.source_id,
    input.target_id,
    input.kind ?? 'chat',
    input.directed !== false ? 1 : 0,
    input.label ?? null,
    input.metadata ? JSON.stringify(input.metadata) : null,
  );
  return getConnection(id)!;
}

export function getConnection(id: string): Connection | undefined {
  return db.prepare(`SELECT * FROM connections WHERE id = ?`).get(id) as Connection | undefined;
}

export function listConnections(projectPath: string): Connection[] {
  // Join through agent_cards to filter by project
  return db.prepare(`
    SELECT c.*
    FROM connections c
    JOIN agent_cards src ON c.source_id = src.id
    WHERE src.project_path = ?
    ORDER BY c.created_at ASC
  `).all(projectPath) as unknown as Connection[];
}

export function deleteConnection(id: string): boolean {
  const r = db.prepare(`DELETE FROM connections WHERE id = ?`).run(id);
  return r.changes > 0;
}

// ─── Conversations ────────────────────────────────────────────────────────────

export interface CreateConversationInput {
  kind: ConversationKind;
  title?: string;
  participant_ids?: string[];  // agent_card ids
}

export function createConversation(input: CreateConversationInput): Conversation {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO conversations (id, kind, title)
    VALUES (?, ?, ?)
  `).run(id, input.kind, input.title ?? null);

  // Add participants
  if (input.participant_ids?.length) {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO conversation_participants (conversation_id, agent_card_id, role)
      VALUES (?, ?, 'member')
    `);
    for (const agentId of input.participant_ids) {
      stmt.run(id, agentId);
    }
  }

  return getConversation(id)!;
}

export function getConversation(id: string): Conversation | undefined {
  return db.prepare(`SELECT * FROM conversations WHERE id = ?`).get(id) as Conversation | undefined;
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export interface GetMessagesOptions {
  limit?: number;
  before?: string;  // cursor: created_at of last seen message (ISO string)
  after?: string;   // cursor: created_at for forward paging
}

export function getMessages(conversationId: string, opts: GetMessagesOptions = {}): {
  messages: Message[];
  hasMore: boolean;
} {
  const limit = Math.min(opts.limit ?? 50, 200);
  const conditions: string[] = ['conversation_id = ?'];
  const params: (string | number | null)[] = [conversationId];

  if (opts.before) {
    conditions.push('created_at < ?');
    params.push(opts.before);
  }
  if (opts.after) {
    conditions.push('created_at > ?');
    params.push(opts.after);
  }

  // Fetch limit+1 to determine hasMore
  params.push(limit + 1);

  const rows = db.prepare(`
    SELECT * FROM messages
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...params) as unknown as Message[];

  const hasMore = rows.length > limit;
  const messages = hasMore ? rows.slice(0, limit) : rows;

  return { messages: messages.reverse(), hasMore };
}

export function insertMessage(input: {
  conversation_id: string;
  sender_id?: string;
  sender_role: SenderRole;
  content: string;
  artifacts?: string;
  in_reply_to?: string;
}): Message {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO messages (id, conversation_id, sender_id, sender_role, content, artifacts, in_reply_to)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.conversation_id,
    input.sender_id ?? null,
    input.sender_role,
    input.content,
    input.artifacts ?? null,
    input.in_reply_to ?? null,
  );
  return db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as unknown as Message;
}

// ─── Canvas Layout ────────────────────────────────────────────────────────────

export interface LayoutPatch {
  viewport?: { x: number; y: number; zoom: number };
  node_positions?: Record<string, { x: number; y: number }>;
}

export function upsertCanvasLayout(projectPath: string, patch: LayoutPatch): CanvasLayout {
  const existing = db.prepare(
    `SELECT * FROM canvas_layouts WHERE project_path = ?`
  ).get(projectPath) as CanvasLayout | undefined;

  if (!existing) {
    db.prepare(`
      INSERT INTO canvas_layouts (project_path, viewport, node_positions)
      VALUES (?, ?, ?)
    `).run(
      projectPath,
      patch.viewport ? JSON.stringify(patch.viewport) : '{"x":0,"y":0,"zoom":1}',
      patch.node_positions ? JSON.stringify(patch.node_positions) : '{}',
    );
  } else {
    const viewport = patch.viewport
      ? JSON.stringify(patch.viewport)
      : existing.viewport;
    const nodePositions = patch.node_positions
      ? JSON.stringify(patch.node_positions)
      : existing.node_positions;
    db.prepare(`
      UPDATE canvas_layouts
      SET viewport = ?, node_positions = ?, updated_at = datetime('now')
      WHERE project_path = ?
    `).run(viewport, nodePositions, projectPath);
  }

  return db.prepare(
    `SELECT * FROM canvas_layouts WHERE project_path = ?`
  ).get(projectPath) as unknown as CanvasLayout;
}

export function getCanvasLayout(projectPath: string): CanvasLayout | undefined {
  return db.prepare(
    `SELECT * FROM canvas_layouts WHERE project_path = ?`
  ).get(projectPath) as unknown as CanvasLayout | undefined;
}
