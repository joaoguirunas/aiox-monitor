import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import {
  buildAgentContext,
  buildNeighborsBlock,
  formatNeighborLine,
  loadNeighbors,
  MAX_HISTORY,
  type Neighbor,
} from '../src/server/agent-bus/context-injector.js';

// ─── Schema helpers ───────────────────────────────────────────────────────────

function buildSchema(db: DatabaseSync): void {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS agent_cards (
      id            TEXT PRIMARY KEY,
      kind          TEXT NOT NULL DEFAULT 'chat',
      display_name  TEXT NOT NULL,
      aiox_agent    TEXT,
      system_prompt TEXT,
      is_chief      INTEGER DEFAULT 0,
      status        TEXT DEFAULT 'idle',
      user_id       TEXT NOT NULL DEFAULT 'local'
    );

    CREATE TABLE IF NOT EXISTS connections (
      id        TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES agent_cards(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL REFERENCES agent_cards(id) ON DELETE CASCADE,
      directed  INTEGER DEFAULT 1,
      kind      TEXT DEFAULT 'chat',
      user_id   TEXT NOT NULL DEFAULT 'local'
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id      TEXT PRIMARY KEY,
      kind    TEXT DEFAULT 'peer',
      user_id TEXT NOT NULL DEFAULT 'local'
    );

    CREATE TABLE IF NOT EXISTS messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id       TEXT REFERENCES agent_cards(id) ON DELETE SET NULL,
      sender_role     TEXT,
      content         TEXT NOT NULL,
      created_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_msg_conv_created
      ON messages(conversation_id, created_at);
  `);
}

function makeDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  buildSchema(db);
  return db;
}

// ─── Insert helpers ───────────────────────────────────────────────────────────

let _cardSeq = 0;
let _connSeq = 0;
let _msgSeq  = 0;

function insertCard(
  db: DatabaseSync,
  id: string,
  opts: { displayName?: string; aiox_agent?: string; systemPrompt?: string; isChief?: boolean } = {},
): void {
  db.prepare(`
    INSERT INTO agent_cards (id, display_name, aiox_agent, system_prompt, is_chief)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    id,
    opts.displayName ?? id,
    opts.aiox_agent ?? null,
    opts.systemPrompt ?? null,
    opts.isChief ? 1 : 0,
  );
  _cardSeq++;
}

function insertConnection(
  db: DatabaseSync,
  sourceId: string,
  targetId: string,
  opts: { directed?: boolean } = {},
): void {
  _connSeq++;
  db.prepare(`
    INSERT INTO connections (id, source_id, target_id, directed)
    VALUES (?, ?, ?, ?)
  `).run(
    `conn-${_connSeq}`,
    sourceId,
    targetId,
    opts.directed === false ? 0 : 1,
  );
}

function insertConversation(db: DatabaseSync, id: string): void {
  db.prepare(`INSERT INTO conversations (id) VALUES (?)`).run(id);
}

function insertMessage(
  db: DatabaseSync,
  conversationId: string,
  opts: { senderId?: string; senderRole?: string; content?: string; createdAt?: string } = {},
): void {
  _msgSeq++;
  db.prepare(`
    INSERT INTO messages (id, conversation_id, sender_id, sender_role, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    `msg-${_msgSeq}`,
    conversationId,
    opts.senderId ?? null,
    opts.senderRole ?? 'user',
    opts.content ?? `message ${_msgSeq}`,
    opts.createdAt ?? new Date(Date.now() + _msgSeq * 1000).toISOString(),
  );
}

// ─── Reset seq counters between test groups ───────────────────────────────────

function resetSeq(): void {
  _cardSeq = 0;
  _connSeq = 0;
  _msgSeq  = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('formatNeighborLine', () => {
  it('outbound with aiox_agent', () => {
    const n: Neighbor = { id: 'x', display_name: 'Obi-Wan', aiox_agent: 'Architect', direction: 'outbound' };
    assert.equal(formatNeighborLine(n), '- Obi-Wan (Architect) — outbound: você pode mandar /ask');
  });

  it('inbound without aiox_agent', () => {
    const n: Neighbor = { id: 'x', display_name: 'Chief', aiox_agent: null, direction: 'inbound' };
    assert.equal(formatNeighborLine(n), '- Chief — inbound: ele pode te delegar');
  });

  it('bidirectional', () => {
    const n: Neighbor = { id: 'x', display_name: 'Rey', aiox_agent: 'UX', direction: 'bidirectional' };
    assert.equal(formatNeighborLine(n), '- Rey (UX) — bidirectional');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('buildNeighborsBlock', () => {
  const card = { id: 'luke', display_name: 'Luke', aiox_agent: 'Dev-Alpha', system_prompt: null, is_chief: 0 };

  it('no neighbors — shows placeholder', () => {
    const block = buildNeighborsBlock(card, []);
    assert.ok(block.includes('Você é "Luke (Dev-Alpha)"'));
    assert.ok(block.includes('(nenhum vizinho conectado)'));
    assert.ok(block.includes('/ask retorna 403'));
  });

  it('one outbound neighbor', () => {
    const neighbors: Neighbor[] = [
      { id: 'obi', display_name: 'Obi-Wan', aiox_agent: 'Architect', direction: 'outbound' },
    ];
    const block = buildNeighborsBlock(card, neighbors);
    assert.ok(block.includes('- Obi-Wan (Architect) — outbound: você pode mandar /ask'));
    assert.ok(block.includes('/broadcast <mensagem>'));
  });

  it('card without aiox_agent uses plain display_name', () => {
    const plain = { ...card, aiox_agent: null };
    const block = buildNeighborsBlock(plain, []);
    assert.ok(block.includes('Você é "Luke"'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('loadNeighbors', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    resetSeq();
    db = makeDb();
  });

  it('no connections → empty array', () => {
    insertCard(db, 'luke');
    const result = loadNeighbors('luke', db);
    assert.deepEqual(result, []);
  });

  it('outbound connection detected', () => {
    insertCard(db, 'luke');
    insertCard(db, 'obi', { displayName: 'Obi-Wan', aiox_agent: 'Architect' });
    insertConnection(db, 'luke', 'obi');

    const neighbors = loadNeighbors('luke', db);
    assert.equal(neighbors.length, 1);
    assert.equal(neighbors[0].id, 'obi');
    assert.equal(neighbors[0].direction, 'outbound');
  });

  it('inbound connection detected', () => {
    insertCard(db, 'luke');
    insertCard(db, 'chief', { displayName: 'Chief', isChief: true });
    insertConnection(db, 'chief', 'luke'); // chief → luke

    const neighbors = loadNeighbors('luke', db);
    assert.equal(neighbors.length, 1);
    assert.equal(neighbors[0].id, 'chief');
    assert.equal(neighbors[0].direction, 'inbound');
  });

  it('two directed edges in both directions → bidirectional', () => {
    insertCard(db, 'a');
    insertCard(db, 'b');
    insertConnection(db, 'a', 'b'); // a → b
    insertConnection(db, 'b', 'a'); // b → a

    const neighborsOfA = loadNeighbors('a', db);
    assert.equal(neighborsOfA.length, 1);
    assert.equal(neighborsOfA[0].direction, 'bidirectional');
  });

  it('undirected connection (directed=0) → bidirectional', () => {
    insertCard(db, 'a');
    insertCard(db, 'b');
    insertConnection(db, 'a', 'b', { directed: false });

    const neighbors = loadNeighbors('a', db);
    assert.equal(neighbors.length, 1);
    assert.equal(neighbors[0].direction, 'bidirectional');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('buildAgentContext — no neighbors', () => {
  it('returns neighbors block with placeholder when card has no connections', () => {
    resetSeq();
    const db = makeDb();
    insertCard(db, 'solo', { displayName: 'Han Solo', aiox_agent: 'Dev', systemPrompt: 'You are Han Solo.' });
    insertConversation(db, 'conv-1');

    const ctx = buildAgentContext('solo', 'conv-1', db);
    assert.ok(ctx.includes('You are Han Solo.'));
    assert.ok(ctx.includes('## Seus vizinhos neste canvas'));
    assert.ok(ctx.includes('(nenhum vizinho conectado)'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('buildAgentContext — 1 outbound neighbor', () => {
  let db: DatabaseSync;

  before(() => {
    resetSeq();
    db = makeDb();
    insertCard(db, 'luke', { displayName: 'Luke', aiox_agent: 'Dev-Alpha', systemPrompt: 'Be Luke.' });
    insertCard(db, 'obi', { displayName: 'Obi-Wan', aiox_agent: 'Architect' });
    insertConnection(db, 'luke', 'obi');
    insertConversation(db, 'conv-luke');
    insertMessage(db, 'conv-luke', { senderId: 'obi', senderRole: 'agent', content: 'May the Force be with you.' });
  });

  it('includes system prompt', () => {
    const ctx = buildAgentContext('luke', 'conv-luke', db);
    assert.ok(ctx.startsWith('Be Luke.'));
  });

  it('includes outbound neighbor', () => {
    const ctx = buildAgentContext('luke', 'conv-luke', db);
    assert.ok(ctx.includes('Obi-Wan (Architect) — outbound: você pode mandar /ask'));
  });

  it('includes conversation history', () => {
    const ctx = buildAgentContext('luke', 'conv-luke', db);
    assert.ok(ctx.includes('May the Force be with you.'));
    assert.ok(ctx.includes('[agent]'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('buildAgentContext — mesh de 5 cards', () => {
  let db: DatabaseSync;

  before(() => {
    resetSeq();
    db = makeDb();
    // 5 cards in a ring: A→B→C→D→E→A (all outbound from each node's perspective)
    const ids = ['a', 'b', 'c', 'd', 'e'];
    for (const id of ids) insertCard(db, id, { displayName: `Card-${id.toUpperCase()}` });
    for (let i = 0; i < ids.length; i++) {
      insertConnection(db, ids[i], ids[(i + 1) % ids.length]);
    }
    insertConversation(db, 'conv-mesh');
  });

  it('each card has exactly 1 outbound and 1 inbound neighbor visible from its own perspective', () => {
    const neighbors = loadNeighbors('c', db);
    // c→d (outbound) and b→c (inbound for c)
    assert.equal(neighbors.length, 2);
    const directions = new Set(neighbors.map(n => n.direction));
    assert.ok(directions.has('outbound'));
    assert.ok(directions.has('inbound'));
  });

  it('context for card C mentions two neighbors', () => {
    const ctx = buildAgentContext('c', 'conv-mesh', db);
    // One line per neighbor
    const neighborLines = ctx.split('\n').filter(l => l.startsWith('- Card-'));
    assert.equal(neighborLines.length, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('buildAgentContext — history trimming', () => {
  let db: DatabaseSync;

  before(() => {
    resetSeq();
    db = makeDb();
    insertCard(db, 'agent-x', { displayName: 'Agent X' });
    insertConversation(db, 'conv-trim');

    // Insert MAX_HISTORY + 5 messages; we expect only MAX_HISTORY in context.
    for (let i = 1; i <= MAX_HISTORY + 5; i++) {
      insertMessage(db, 'conv-trim', {
        senderId: 'agent-x',
        senderRole: 'agent',
        content: `message-${i}`,
      });
    }
  });

  it(`includes at most ${MAX_HISTORY} messages`, () => {
    const ctx = buildAgentContext('agent-x', 'conv-trim', db);
    const msgLines = ctx.split('\n').filter(l => l.startsWith('[agent]'));
    assert.equal(msgLines.length, MAX_HISTORY);
  });

  it('includes the MOST RECENT messages (trims oldest)', () => {
    const ctx = buildAgentContext('agent-x', 'conv-trim', db);
    // Most recent is message-(MAX_HISTORY+5) = message-25 — must be present.
    assert.ok(ctx.includes(`message-${MAX_HISTORY + 5}`), 'should include most recent');
    // message-5 is the last trimmed message; safe to test because
    // 'message-5' is not a substring of 'message-15' or 'message-25'
    // (char at index 8 differs: '1'/'2' vs '5').
    assert.ok(!ctx.includes('message-5'), 'should not include oldest trimmed messages');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('buildAgentContext — regeneração após connection change', () => {
  let db: DatabaseSync;

  before(() => {
    resetSeq();
    db = makeDb();
    insertCard(db, 'main', { displayName: 'Main' });
    insertCard(db, 'peer', { displayName: 'Peer' });
    insertConversation(db, 'conv-regen');
  });

  it('initially no neighbors', () => {
    const ctx = buildAgentContext('main', 'conv-regen', db);
    assert.ok(ctx.includes('(nenhum vizinho conectado)'));
  });

  it('after connection.added — re-call reflects new neighbor', () => {
    // Simulate connection.added event: dispatcher inserts and re-calls buildAgentContext
    insertConnection(db, 'main', 'peer');

    const ctx = buildAgentContext('main', 'conv-regen', db);
    assert.ok(!ctx.includes('(nenhum vizinho conectado)'));
    assert.ok(ctx.includes('Peer'));
    assert.ok(ctx.includes('outbound'));
  });

  it('after connection.removed — re-call no longer shows removed neighbor', () => {
    // Remove the connection
    db.prepare(`DELETE FROM connections WHERE source_id = 'main' AND target_id = 'peer'`).run();

    const ctx = buildAgentContext('main', 'conv-regen', db);
    assert.ok(ctx.includes('(nenhum vizinho conectado)'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('buildAgentContext — edge cases', () => {
  it('throws when cardId not found', () => {
    const db = makeDb();
    insertConversation(db, 'conv-x');
    assert.throws(
      () => buildAgentContext('ghost', 'conv-x', db),
      /agent_card not found: ghost/,
    );
  });

  it('omits system_prompt section when null', () => {
    resetSeq();
    const db = makeDb();
    insertCard(db, 'no-prompt', { displayName: 'NP' }); // systemPrompt is null
    insertConversation(db, 'conv-np');

    const ctx = buildAgentContext('no-prompt', 'conv-np', db);
    // Should start directly with the neighbors block
    assert.ok(ctx.trimStart().startsWith('## Seus vizinhos'));
  });

  it('omits history section when conversation is empty', () => {
    resetSeq();
    const db = makeDb();
    insertCard(db, 'empty', { displayName: 'Empty', systemPrompt: 'Sys.' });
    insertConversation(db, 'conv-empty');

    const ctx = buildAgentContext('empty', 'conv-empty', db);
    assert.ok(!ctx.includes('Histórico'));
  });

  it('messages from null sender_id render with role label', () => {
    resetSeq();
    const db = makeDb();
    insertCard(db, 'bot', { displayName: 'Bot' });
    insertConversation(db, 'conv-sys');
    // sender_id intentionally null (system message)
    insertMessage(db, 'conv-sys', { senderId: undefined, senderRole: 'system', content: 'Initialized.' });

    const ctx = buildAgentContext('bot', 'conv-sys', db);
    assert.ok(ctx.includes('[system]'));
    assert.ok(ctx.includes('Initialized.'));
  });
});
