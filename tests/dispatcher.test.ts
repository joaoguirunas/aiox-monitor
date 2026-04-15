/**
 * JOB-046 — MessageDispatcher unit tests
 *
 * All tests use in-memory SQLite — no global DB singleton touched.
 * PtyWriter and broadcastFn are injected mocks.
 *
 * Coverage:
 *   §1 Authorization: reject when no connection, allow with outbound edge,
 *      allow undirected, allow chief, allow 'user' sender
 *   §2 Depth guard: blocked at MAX_DEPTH+1, allowed up to MAX_DEPTH
 *   §3 Context injected: enriched prompt passed to ptyWriter
 *   §4 chat-kind stub: returns response, persists message
 *   §5 terminal-kind: dispatches via ptyWriter with terminal_name
 *   §6 no_terminal_name: terminal card without maestri_terminal_name → 422
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { dispatch } from '../src/server/agent-bus/dispatcher.js';
import type { PtyWriter } from '../src/server/agent-bus/stdin-writer.js';
import type { WsMessage } from '../src/server/ws-broadcaster.js';

// ─── Schema bootstrap ─────────────────────────────────────────────────────────

function buildSchema(db: DatabaseSync): void {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS agent_cards (
      id                    TEXT PRIMARY KEY,
      kind                  TEXT NOT NULL CHECK(kind IN ('chat','terminal','hybrid')),
      display_name          TEXT NOT NULL,
      aiox_agent            TEXT,
      project_path          TEXT,
      pty_terminal_id       TEXT,
      maestri_terminal_name TEXT,
      skill_path            TEXT,
      is_chief              INTEGER DEFAULT 0,
      status                TEXT DEFAULT 'idle',
      system_prompt         TEXT,
      model                 TEXT,
      user_id               TEXT NOT NULL DEFAULT 'local',
      created_at            TEXT DEFAULT (datetime('now')),
      last_active           TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS connections (
      id         TEXT PRIMARY KEY,
      source_id  TEXT NOT NULL REFERENCES agent_cards(id) ON DELETE CASCADE,
      target_id  TEXT NOT NULL REFERENCES agent_cards(id) ON DELETE CASCADE,
      directed   INTEGER DEFAULT 1,
      kind       TEXT DEFAULT 'chat',
      label      TEXT,
      metadata   TEXT,
      user_id    TEXT NOT NULL DEFAULT 'local',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(source_id, target_id, kind)
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id              TEXT PRIMARY KEY,
      kind            TEXT DEFAULT 'peer',
      title           TEXT,
      user_id         TEXT NOT NULL DEFAULT 'local',
      created_at      TEXT DEFAULT (datetime('now')),
      last_message_at TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id       TEXT REFERENCES agent_cards(id) ON DELETE SET NULL,
      sender_role     TEXT NOT NULL,
      content         TEXT NOT NULL,
      artifacts       TEXT,
      in_reply_to     TEXT,
      created_at      TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_msg_conv_created ON messages(conversation_id, created_at);
  `);
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

interface Fixtures {
  db: DatabaseSync;
  senderCard: string;
  targetChat: string;
  targetTerminal: string;
  chiefCard: string;
  convId: string;
  broadcastedEvents: WsMessage[];
  broadcastFn: (msg: WsMessage) => void;
  noopPtyWriter: PtyWriter;
  spyPtyWriter: (captured: string[]) => PtyWriter;
}

function makeFixtures(): Fixtures {
  const db = new DatabaseSync(':memory:');
  buildSchema(db);

  const senderCard = 'sender-001';
  const targetChat = 'target-chat-001';
  const targetTerminal = 'target-term-001';
  const chiefCard = 'chief-001';
  const convId = 'conv-001';

  // Insert agent cards
  db.prepare(`
    INSERT INTO agent_cards (id, kind, display_name, is_chief)
    VALUES
      (?, 'chat', 'Sender', 0),
      (?, 'chat', 'TargetChat', 0),
      (?, 'terminal', 'TargetTerminal', 0),
      (?, 'chat', 'Chief', 1)
  `).run(senderCard, targetChat, targetTerminal, chiefCard);

  // Insert conversation
  db.prepare(`INSERT INTO conversations (id, kind) VALUES (?, 'peer')`).run(convId);

  const broadcastedEvents: WsMessage[] = [];
  const broadcastFn = (msg: WsMessage) => broadcastedEvents.push(msg);

  const noopPtyWriter: PtyWriter = async (_name, _prompt, _onChunk) => ({ ok: true });

  const spyPtyWriter = (captured: string[]): PtyWriter =>
    async (_name, prompt, _onChunk) => {
      captured.push(prompt);
      return { ok: true };
    };

  return {
    db, senderCard, targetChat, targetTerminal, chiefCard, convId,
    broadcastedEvents, broadcastFn, noopPtyWriter, spyPtyWriter,
  };
}

// ─── §1 Authorization ─────────────────────────────────────────────────────────

describe('Dispatcher — authorization', () => {
  it('rejects when sender has no connection to target', async () => {
    const f = makeFixtures();
    // No connection between senderCard and targetChat

    const result = await dispatch(
      { targetCardId: f.targetChat, conversationId: f.convId, content: 'hello', senderId: f.senderCard },
      { db: f.db, ptyWriter: f.noopPtyWriter, broadcastFn: f.broadcastFn },
    );

    assert.equal(result.ok, false);
    assert.equal((result as { reason: string }).reason, 'unauthorized');
  });

  it('allows dispatch when outbound directed connection exists', async () => {
    const f = makeFixtures();
    f.db.prepare(`
      INSERT INTO connections (id, source_id, target_id, directed, kind)
      VALUES ('conn-1', ?, ?, 1, 'chat')
    `).run(f.senderCard, f.targetChat);

    const result = await dispatch(
      { targetCardId: f.targetChat, conversationId: f.convId, content: 'hello', senderId: f.senderCard },
      { db: f.db, ptyWriter: f.noopPtyWriter, broadcastFn: f.broadcastFn },
    );

    assert.equal(result.ok, true);
  });

  it('allows dispatch via undirected connection (directed=0)', async () => {
    const f = makeFixtures();
    f.db.prepare(`
      INSERT INTO connections (id, source_id, target_id, directed, kind)
      VALUES ('conn-2', ?, ?, 0, 'chat')
    `).run(f.targetChat, f.senderCard); // reversed direction, but undirected

    const result = await dispatch(
      { targetCardId: f.targetChat, conversationId: f.convId, content: 'hello', senderId: f.senderCard },
      { db: f.db, ptyWriter: f.noopPtyWriter, broadcastFn: f.broadcastFn },
    );

    assert.equal(result.ok, true);
  });

  it('allows chief card to dispatch without connection', async () => {
    const f = makeFixtures();
    // chiefCard has no connection to targetChat

    const result = await dispatch(
      { targetCardId: f.targetChat, conversationId: f.convId, content: 'from chief', senderId: f.chiefCard },
      { db: f.db, ptyWriter: f.noopPtyWriter, broadcastFn: f.broadcastFn },
    );

    assert.equal(result.ok, true);
  });

  it('allows user sender without connection', async () => {
    const f = makeFixtures();

    const result = await dispatch(
      { targetCardId: f.targetChat, conversationId: f.convId, content: 'from user', senderId: 'user' },
      { db: f.db, ptyWriter: f.noopPtyWriter, broadcastFn: f.broadcastFn },
    );

    assert.equal(result.ok, true);
  });

  it('returns card_not_found for unknown target', async () => {
    const f = makeFixtures();

    const result = await dispatch(
      { targetCardId: 'nonexistent-card', conversationId: f.convId, content: 'hello', senderId: 'user' },
      { db: f.db, ptyWriter: f.noopPtyWriter, broadcastFn: f.broadcastFn },
    );

    assert.equal(result.ok, false);
    assert.equal((result as { reason: string }).reason, 'card_not_found');
  });
});

// ─── §2 Depth guard ───────────────────────────────────────────────────────────

describe('Dispatcher — depth guard integration', () => {
  it('blocks dispatch when depth limit is exceeded', async () => {
    const f = makeFixtures();
    // Wire connection
    f.db.prepare(`
      INSERT INTO connections (id, source_id, target_id, directed, kind)
      VALUES ('conn-d', ?, ?, 1, 'chat')
    `).run(f.senderCard, f.targetChat);

    // Burn 3 hops manually (MAX_DEPTH = 3)
    const { depthGuard } = await import('../src/server/agent-bus/depth-guard.js');
    const guard = depthGuard;
    guard.clearConversation(f.convId);
    guard.markDispatched(f.convId, 'a', 'b');
    guard.markDispatched(f.convId, 'b', 'c');
    guard.markDispatched(f.convId, 'c', 'd');

    const result = await dispatch(
      { targetCardId: f.targetChat, conversationId: f.convId, content: 'overflow', senderId: f.senderCard },
      { db: f.db, ptyWriter: f.noopPtyWriter, broadcastFn: f.broadcastFn },
    );

    assert.equal(result.ok, false);
    assert.equal((result as { reason: string }).reason, 'depth_exceeded');

    // Cleanup for subsequent tests
    guard.clearConversation(f.convId);
  });
});

// ─── §3 Context injection ─────────────────────────────────────────────────────

describe('Dispatcher — context injection', () => {
  it('passes enriched context (system_prompt) to ptyWriter', async () => {
    const f = makeFixtures();
    const SYSTEM_PROMPT = 'Você é um agente especializado em testes.';
    const TERMINAL_NAME = 'test-terminal';

    // Set system_prompt and terminal name on target
    f.db.prepare(`
      UPDATE agent_cards SET kind = 'terminal', system_prompt = ?, maestri_terminal_name = ? WHERE id = ?
    `).run(SYSTEM_PROMPT, TERMINAL_NAME, f.targetChat);

    const captured: string[] = [];

    const result = await dispatch(
      { targetCardId: f.targetChat, conversationId: f.convId, content: 'test message', senderId: 'user' },
      { db: f.db, ptyWriter: f.spyPtyWriter(captured), broadcastFn: f.broadcastFn },
    );

    assert.equal(result.ok, true);
    assert.equal(captured.length, 1);
    // System prompt should appear in the enriched context
    assert.ok(captured[0].includes(SYSTEM_PROMPT), 'system_prompt should be in enriched context');
  });
});

// ─── §4 Chat kind ─────────────────────────────────────────────────────────────

describe('Dispatcher — chat kind (stub)', () => {
  it('dispatches to chat card, broadcasts chat.chunk events, persists response', async () => {
    const f = makeFixtures();

    const result = await dispatch(
      { targetCardId: f.targetChat, conversationId: f.convId, content: 'ping', senderId: 'user' },
      { db: f.db, ptyWriter: f.noopPtyWriter, broadcastFn: f.broadcastFn },
    );

    assert.equal(result.ok, true);

    // chat.chunk events should have been broadcast
    const chunks = f.broadcastedEvents.filter(e => e.type === 'chat.chunk');
    assert.ok(chunks.length > 0, 'should emit chat.chunk events');

    // Response persisted in DB
    const messages = f.db.prepare(
      `SELECT * FROM messages WHERE conversation_id = ?`
    ).all(f.convId) as Array<{ sender_role: string; content: string }>;

    assert.ok(messages.length >= 2, 'at least sender message + response');
    const response = messages.find(m => m.sender_role === 'agent');
    assert.ok(response, 'agent response should be persisted');
    assert.ok(response!.content.length > 0);
  });
});

// ─── §5 Terminal kind ─────────────────────────────────────────────────────────

describe('Dispatcher — terminal kind', () => {
  it('dispatches via ptyWriter with correct terminal name', async () => {
    const f = makeFixtures();
    const TERMINAL_NAME = 'my-maestri-terminal';

    f.db.prepare(`
      UPDATE agent_cards SET maestri_terminal_name = ? WHERE id = ?
    `).run(TERMINAL_NAME, f.targetTerminal);

    let capturedTerminal = '';
    const spyWriter: PtyWriter = async (name, _prompt, _onChunk) => {
      capturedTerminal = name;
      return { ok: true };
    };

    const result = await dispatch(
      { targetCardId: f.targetTerminal, conversationId: f.convId, content: 'run tests', senderId: 'user' },
      { db: f.db, ptyWriter: spyWriter, broadcastFn: f.broadcastFn },
    );

    assert.equal(result.ok, true);
    assert.equal(capturedTerminal, TERMINAL_NAME);
  });

  it('returns no_terminal_name when terminal card has no maestri_terminal_name', async () => {
    const f = makeFixtures();
    // targetTerminal has no maestri_terminal_name (NULL by default)

    const result = await dispatch(
      { targetCardId: f.targetTerminal, conversationId: f.convId, content: 'hello', senderId: 'user' },
      { db: f.db, ptyWriter: f.noopPtyWriter, broadcastFn: f.broadcastFn },
    );

    assert.equal(result.ok, false);
    assert.equal((result as { reason: string }).reason, 'no_terminal_name');
  });
});

// ─── §6 WS events ────────────────────────────────────────────────────────────

describe('Dispatcher — WS broadcast events', () => {
  it('emits message.new for sender and response', async () => {
    const f = makeFixtures();

    await dispatch(
      { targetCardId: f.targetChat, conversationId: f.convId, content: 'check WS', senderId: 'user' },
      { db: f.db, ptyWriter: f.noopPtyWriter, broadcastFn: f.broadcastFn },
    );

    const newMsgEvents = f.broadcastedEvents.filter(e => e.type === 'message.new');
    assert.ok(newMsgEvents.length >= 2, 'should emit message.new for inbound + response');
  });
});
