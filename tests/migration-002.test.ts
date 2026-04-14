/**
 * Migration 002 — PTY FK & Triggers
 * Story: JOB-029
 *
 * Tests up (apply) and down (rollback) against an in-memory SQLite database.
 *
 * Coverage:
 *   - FK agent_cards.pty_terminal_id → command_room_terminals(id) ON DELETE SET NULL
 *   - Trigger trg_messages_sync_last_message_at (AFTER INSERT on messages)
 *   - Trigger trg_agent_cards_sync_canvas_updated_at (AFTER UPDATE OF last_active)
 *   - Rollback removes both triggers and drops the FK
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.join(__dirname, '../src/server/db/migrations');

function readSql(filename: string): string {
  return fs.readFileSync(path.join(MIGRATIONS, filename), 'utf8');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function triggerExists(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?`)
    .get(name) as unknown;
  return row !== undefined;
}

function fkExistsOnAgentCards(db: DatabaseSync): boolean {
  // pragma_foreign_key_list returns rows only when FK definitions exist
  const rows = db
    .prepare(`SELECT * FROM pragma_foreign_key_list('agent_cards')`)
    .all() as Array<Record<string, unknown>>;
  return rows.some(
    (r) =>
      r['table'] === 'command_room_terminals' &&
      r['from'] === 'pty_terminal_id',
  );
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

function applyMigration001(db: DatabaseSync): void {
  // Minimal stub of command_room_terminals (created by JOB-012)
  db.exec(`
    CREATE TABLE IF NOT EXISTS command_room_terminals (
      id          TEXT PRIMARY KEY,
      agent_name  TEXT,
      project_path TEXT,
      pty_status  TEXT DEFAULT 'idle',
      category_id TEXT,
      is_chief    INTEGER DEFAULT 0
    );
  `);

  // Apply the real migration 001
  const sql001 = readSql('001_sala_de_comando_v2.sql');
  db.exec(sql001);
}

function seedBasicRows(db: DatabaseSync): void {
  db.exec(`
    INSERT INTO command_room_terminals (id, agent_name) VALUES ('term-1', 'chief');

    INSERT INTO agent_cards (id, kind, display_name, user_id)
    VALUES ('card-1', 'chat', 'Chief', 'local');

    INSERT INTO conversations (id, kind, user_id)
    VALUES ('conv-1', 'peer', 'local');

    INSERT INTO canvas_layouts (project_path, user_id, updated_at)
    VALUES ('/proj/alpha', 'local', '2026-01-01 00:00:00');

    INSERT INTO agent_cards (id, kind, display_name, project_path, user_id)
    VALUES ('card-2', 'terminal', 'Dev', '/proj/alpha', 'local');
  `);
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('Migration 002 — up', () => {
  let db: DatabaseSync;

  before(() => {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    applyMigration001(db);
    seedBasicRows(db);

    const sql002 = readSql('002_pty_fk_and_triggers.sql');
    db.exec(sql002);
  });

  after(() => db.close());

  // ── FK ────────────────────────────────────────────────────────────────────

  it('FK definition exists on agent_cards.pty_terminal_id', () => {
    assert.ok(fkExistsOnAgentCards(db), 'FK to command_room_terminals not found');
  });

  it('FK accepts valid pty_terminal_id', () => {
    db.exec(`
      UPDATE agent_cards SET pty_terminal_id = 'term-1' WHERE id = 'card-1'
    `);
    const row = db
      .prepare(`SELECT pty_terminal_id FROM agent_cards WHERE id = 'card-1'`)
      .get() as Record<string, unknown>;
    assert.equal(row['pty_terminal_id'], 'term-1');
  });

  it('FK: deleting terminal sets pty_terminal_id to NULL (ON DELETE SET NULL)', () => {
    db.exec(`DELETE FROM command_room_terminals WHERE id = 'term-1'`);
    const row = db
      .prepare(`SELECT pty_terminal_id FROM agent_cards WHERE id = 'card-1'`)
      .get() as Record<string, unknown>;
    assert.equal(row['pty_terminal_id'], null);
  });

  it('FK: inserting card with non-existent pty_terminal_id throws', () => {
    assert.throws(() => {
      db.exec(`
        INSERT INTO agent_cards (id, kind, display_name, pty_terminal_id, user_id)
        VALUES ('card-bad', 'chat', 'Bad', 'does-not-exist', 'local')
      `);
    }, /FOREIGN KEY constraint failed/i);
  });

  // ── Trigger: trg_messages_sync_last_message_at ────────────────────────────

  it('trigger trg_messages_sync_last_message_at is registered', () => {
    assert.ok(triggerExists(db, 'trg_messages_sync_last_message_at'));
  });

  it('trigger updates conversations.last_message_at on INSERT into messages', () => {
    const ts = '2026-04-14 12:00:00';
    db.exec(`
      INSERT INTO messages (id, conversation_id, sender_role, content, user_id, created_at)
      VALUES ('msg-1', 'conv-1', 'user', 'Hello', 'local', '${ts}')
    `);
    const row = db
      .prepare(`SELECT last_message_at FROM conversations WHERE id = 'conv-1'`)
      .get() as Record<string, unknown>;
    assert.equal(row['last_message_at'], ts);
  });

  it('trigger updates last_message_at again on second message INSERT', () => {
    const ts2 = '2026-04-14 13:00:00';
    db.exec(`
      INSERT INTO messages (id, conversation_id, sender_role, content, user_id, created_at)
      VALUES ('msg-2', 'conv-1', 'agent', 'World', 'local', '${ts2}')
    `);
    const row = db
      .prepare(`SELECT last_message_at FROM conversations WHERE id = 'conv-1'`)
      .get() as Record<string, unknown>;
    assert.equal(row['last_message_at'], ts2);
  });

  // ── Trigger: trg_agent_cards_sync_canvas_updated_at ──────────────────────

  it('trigger trg_agent_cards_sync_canvas_updated_at is registered', () => {
    assert.ok(triggerExists(db, 'trg_agent_cards_sync_canvas_updated_at'));
  });

  it('trigger bumps canvas_layouts.updated_at when agent last_active changes', () => {
    const before_ts = (
      db
        .prepare(`SELECT updated_at FROM canvas_layouts WHERE project_path = '/proj/alpha'`)
        .get() as Record<string, unknown>
    )['updated_at'] as string;

    db.exec(`
      UPDATE agent_cards
      SET last_active = datetime('now', '+1 second')
      WHERE id = 'card-2'
    `);

    const after_ts = (
      db
        .prepare(`SELECT updated_at FROM canvas_layouts WHERE project_path = '/proj/alpha'`)
        .get() as Record<string, unknown>
    )['updated_at'] as string;

    assert.notEqual(after_ts, before_ts, 'updated_at was not bumped');
  });

  it('trigger does NOT fire when project_path is NULL (no error, no canvas touch)', () => {
    // card-1 has no project_path — trigger WHEN clause should skip silently
    const before_alpha = (
      db
        .prepare(`SELECT updated_at FROM canvas_layouts WHERE project_path = '/proj/alpha'`)
        .get() as Record<string, unknown>
    )['updated_at'] as string;

    assert.doesNotThrow(() => {
      db.exec(`
        UPDATE agent_cards
        SET last_active = datetime('now', '+10 seconds')
        WHERE id = 'card-1'
      `);
    });

    // canvas_layouts for /proj/alpha must not change (card-1 has no project_path)
    const after_alpha = (
      db
        .prepare(`SELECT updated_at FROM canvas_layouts WHERE project_path = '/proj/alpha'`)
        .get() as Record<string, unknown>
    )['updated_at'] as string;

    assert.equal(after_alpha, before_alpha, 'canvas_layouts was touched by a card with no project_path');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Migration 002 — down (rollback)', () => {
  let db: DatabaseSync;

  before(() => {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    applyMigration001(db);
    seedBasicRows(db);

    db.exec(readSql('002_pty_fk_and_triggers.sql'));
    db.exec(readSql('002_pty_fk_and_triggers_rollback.sql'));
  });

  after(() => db.close());

  it('trigger trg_messages_sync_last_message_at is removed', () => {
    assert.ok(!triggerExists(db, 'trg_messages_sync_last_message_at'));
  });

  it('trigger trg_agent_cards_sync_canvas_updated_at is removed', () => {
    assert.ok(!triggerExists(db, 'trg_agent_cards_sync_canvas_updated_at'));
  });

  it('FK on agent_cards.pty_terminal_id is removed', () => {
    assert.ok(!fkExistsOnAgentCards(db), 'FK should not exist after rollback');
  });

  it('agent_cards data is preserved after rollback', () => {
    const rows = db.prepare(`SELECT id FROM agent_cards ORDER BY id`).all() as Array<Record<string, unknown>>;
    assert.deepEqual(
      rows.map((r) => r['id']),
      ['card-1', 'card-2'],
    );
  });
});
