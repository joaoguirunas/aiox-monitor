import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { createTestDb } from './helpers/test-db';

// ─── DB helpers (replicate query functions with explicit db parameter) ───────

type Row = Record<string, unknown>;

function upsertTerminal(
  db: DatabaseSync,
  projectId: number,
  pid: number,
  opts?: {
    sessionId?: string;
    agentName?: string;
    agentDisplayName?: string;
    currentTool?: string;
    currentInput?: string;
    windowTitle?: string;
  },
): Row {
  const o = opts ?? {};
  db.prepare(`
    INSERT INTO terminals (project_id, pid, session_id, status, agent_name, agent_display_name, current_tool, current_input, window_title)
    VALUES (?, ?, ?, 'processing', ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, pid) DO UPDATE SET
      session_id         = COALESCE(excluded.session_id, terminals.session_id),
      status             = 'processing',
      agent_name         = CASE
        WHEN excluded.agent_name = '' THEN NULL
        WHEN excluded.agent_name IS NOT NULL THEN excluded.agent_name
        ELSE terminals.agent_name
      END,
      agent_display_name = CASE
        WHEN excluded.agent_display_name = '' THEN NULL
        WHEN excluded.agent_display_name IS NOT NULL THEN excluded.agent_display_name
        ELSE terminals.agent_display_name
      END,
      current_tool       = CASE
        WHEN excluded.current_tool IS NOT NULL THEN excluded.current_tool
        ELSE terminals.current_tool
      END,
      current_input      = CASE
        WHEN excluded.current_input IS NOT NULL THEN excluded.current_input
        ELSE terminals.current_input
      END,
      window_title       = CASE
        WHEN excluded.window_title IS NOT NULL THEN excluded.window_title
        ELSE terminals.window_title
      END,
      current_tool_detail = terminals.current_tool_detail,
      waiting_permission = 0,
      first_seen_at      = CASE
        WHEN terminals.first_seen_at IS NULL THEN datetime('now')
        ELSE terminals.first_seen_at
      END,
      last_active        = datetime('now')
  `).run(
    projectId,
    pid,
    o.sessionId ?? null,
    o.agentName ?? null,
    o.agentDisplayName ?? null,
    o.currentTool ?? null,
    o.currentInput ?? null,
    o.windowTitle ?? null,
  );

  return db.prepare(`SELECT * FROM terminals WHERE project_id = ? AND pid = ?`).get(projectId, pid) as Row;
}

function markTerminalsActive(db: DatabaseSync, olderThanSeconds: number): void {
  db.prepare(`
    UPDATE terminals
    SET status = 'active'
    WHERE status = 'processing'
      AND last_active < datetime('now', '-' || ? || ' seconds')
  `).run(olderThanSeconds);
}

function deactivateStaleTerminals(db: DatabaseSync, olderThanSeconds: number): void {
  db.prepare(`
    UPDATE terminals
    SET status = 'inactive'
    WHERE status IN ('processing', 'active')
      AND last_active < datetime('now', '-' || ? || ' seconds')
  `).run(olderThanSeconds);
}

function purgeOldInactiveTerminals(db: DatabaseSync, olderThanSeconds: number): number {
  const r1 = db.prepare(`
    DELETE FROM terminals
    WHERE status = 'inactive'
      AND last_active < datetime('now', '-' || ? || ' seconds')
  `).run(olderThanSeconds);

  const r2 = db.prepare(`
    DELETE FROM terminals
    WHERE id NOT IN (
      SELECT MAX(id) FROM terminals GROUP BY project_id, pid
    )
  `).run();

  return (r1 as { changes: number }).changes + (r2 as { changes: number }).changes;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

let db: DatabaseSync;

beforeEach(() => {
  db = createTestDb();
  db.prepare(`INSERT INTO projects (id, name, path) VALUES (1, 'test-project', '/tmp/test')`).run();
});

describe('upsertTerminal — session-aware upsert', () => {
  it('preserves first_seen_at on upsert with same session_id', () => {
    // First insert
    const t1 = upsertTerminal(db, 1, 100, { sessionId: 'sess-abc', agentName: '@dev' });
    const firstSeen = t1.first_seen_at as string;
    assert.ok(firstSeen, 'first_seen_at should be set on insert');

    // Second upsert with same session_id
    const t2 = upsertTerminal(db, 1, 100, { sessionId: 'sess-abc', currentTool: 'Read' });
    assert.equal(t2.first_seen_at, firstSeen, 'first_seen_at should be preserved');
    assert.equal(t2.agent_name, '@dev', 'agent_name should be preserved via COALESCE');
    assert.equal(t2.current_tool, 'Read', 'current_tool should be updated');
  });

  it('preserves agent_name when upsert passes null (COALESCE behavior)', () => {
    upsertTerminal(db, 1, 200, { sessionId: 'sess-1', agentName: '@qa', agentDisplayName: 'Quinn' });
    // Upsert without agentName (null) — should preserve existing
    const t2 = upsertTerminal(db, 1, 200, { sessionId: 'sess-1', currentTool: 'Bash' });
    assert.equal(t2.agent_name, '@qa', 'agent_name should be preserved when null passed');
    assert.equal(t2.agent_display_name, 'Quinn', 'agent_display_name should be preserved');
  });

  it('clears agent_name when empty string is passed (reset signal)', () => {
    upsertTerminal(db, 1, 300, { sessionId: 'sess-x', agentName: '@dev', agentDisplayName: 'Dex' });
    // Empty string signals "reset to NULL"
    const t2 = upsertTerminal(db, 1, 300, { sessionId: 'sess-x', agentName: '', agentDisplayName: '' });
    assert.equal(t2.agent_name, null, 'agent_name should be cleared to NULL');
    assert.equal(t2.agent_display_name, null, 'agent_display_name should be cleared to NULL');
  });

  it('upsert with session_id = null maintains COALESCE behavior', () => {
    // First insert with session_id
    upsertTerminal(db, 1, 400, { sessionId: 'sess-orig', agentName: '@architect' });
    // System detection upsert (no session_id) — should COALESCE to existing
    const t2 = upsertTerminal(db, 1, 400, { windowTitle: 'iTerm2 Window' });
    assert.equal(t2.session_id, 'sess-orig', 'session_id should be preserved via COALESCE');
    assert.equal(t2.agent_name, '@architect', 'agent_name should be preserved');
    assert.equal(t2.window_title, 'iTerm2 Window', 'window_title should be updated');
  });

  it('updates window_title when new value is provided', () => {
    upsertTerminal(db, 1, 500, { windowTitle: 'Old Title' });
    const t2 = upsertTerminal(db, 1, 500, { windowTitle: 'New Title' });
    assert.equal(t2.window_title, 'New Title');
  });

  it('preserves window_title when null is passed', () => {
    upsertTerminal(db, 1, 600, { windowTitle: 'Preserved Title' });
    const t2 = upsertTerminal(db, 1, 600, { currentTool: 'Grep' });
    assert.equal(t2.window_title, 'Preserved Title', 'window_title should be preserved when null passed');
  });
});

describe('markTerminalsActive — processing to active transition', () => {
  it('transitions processing → active after timeout', () => {
    // Insert terminal with last_active in the past
    db.prepare(`
      INSERT INTO terminals (id, project_id, pid, status, last_active)
      VALUES (1, 1, 100, 'processing', datetime('now', '-600 seconds'))
    `).run();

    markTerminalsActive(db, 300); // 5 min threshold

    const t = db.prepare(`SELECT status FROM terminals WHERE id = 1`).get() as Row;
    assert.equal(t.status, 'active', 'Should transition to active after 5min');
  });

  it('does NOT transition processing terminal that is still recent', () => {
    db.prepare(`
      INSERT INTO terminals (id, project_id, pid, status, last_active)
      VALUES (1, 1, 100, 'processing', datetime('now', '-100 seconds'))
    `).run();

    markTerminalsActive(db, 300);

    const t = db.prepare(`SELECT status FROM terminals WHERE id = 1`).get() as Row;
    assert.equal(t.status, 'processing', 'Should remain processing (only 100s old)');
  });

  it('does NOT affect active or inactive terminals', () => {
    db.prepare(`
      INSERT INTO terminals (id, project_id, pid, status, last_active)
      VALUES (1, 1, 100, 'active', datetime('now', '-600 seconds'))
    `).run();
    db.prepare(`
      INSERT INTO terminals (id, project_id, pid, status, last_active)
      VALUES (2, 1, 200, 'inactive', datetime('now', '-600 seconds'))
    `).run();

    markTerminalsActive(db, 300);

    const t1 = db.prepare(`SELECT status FROM terminals WHERE id = 1`).get() as Row;
    const t2 = db.prepare(`SELECT status FROM terminals WHERE id = 2`).get() as Row;
    assert.equal(t1.status, 'active', 'Already active should stay active');
    assert.equal(t2.status, 'inactive', 'Inactive should not be affected');
  });
});

describe('deactivateStaleTerminals — active to inactive transition', () => {
  it('transitions active → inactive after timeout', () => {
    db.prepare(`
      INSERT INTO terminals (id, project_id, pid, status, last_active)
      VALUES (1, 1, 100, 'active', datetime('now', '-1000 seconds'))
    `).run();

    deactivateStaleTerminals(db, 900); // 15 min threshold

    const t = db.prepare(`SELECT status FROM terminals WHERE id = 1`).get() as Row;
    assert.equal(t.status, 'inactive', 'Should become inactive after 15min of no activity');
  });

  it('also transitions stale processing → inactive', () => {
    db.prepare(`
      INSERT INTO terminals (id, project_id, pid, status, last_active)
      VALUES (1, 1, 100, 'processing', datetime('now', '-1000 seconds'))
    `).run();

    deactivateStaleTerminals(db, 900);

    const t = db.prepare(`SELECT status FROM terminals WHERE id = 1`).get() as Row;
    assert.equal(t.status, 'inactive');
  });

  it('does NOT deactivate terminals with recent activity', () => {
    db.prepare(`
      INSERT INTO terminals (id, project_id, pid, status, last_active)
      VALUES (1, 1, 100, 'active', datetime('now', '-60 seconds'))
    `).run();

    deactivateStaleTerminals(db, 900);

    const t = db.prepare(`SELECT status FROM terminals WHERE id = 1`).get() as Row;
    assert.equal(t.status, 'active', 'Should stay active (only 60s old)');
  });
});

describe('purgeOldInactiveTerminals — cleanup', () => {
  it('deletes inactive terminals older than threshold', () => {
    db.prepare(`
      INSERT INTO terminals (id, project_id, pid, status, last_active)
      VALUES (1, 1, 100, 'inactive', datetime('now', '-7200 seconds'))
    `).run();

    const purged = purgeOldInactiveTerminals(db, 3600); // 1h threshold
    assert.ok(purged > 0, 'Should purge at least 1 terminal');

    const count = db.prepare(`SELECT COUNT(*) as cnt FROM terminals`).get() as { cnt: number };
    assert.equal(count.cnt, 0, 'Terminal should be deleted');
  });

  it('does NOT delete inactive terminals that are recent', () => {
    db.prepare(`
      INSERT INTO terminals (id, project_id, pid, status, last_active)
      VALUES (1, 1, 100, 'inactive', datetime('now', '-1800 seconds'))
    `).run();

    purgeOldInactiveTerminals(db, 3600);

    const count = db.prepare(`SELECT COUNT(*) as cnt FROM terminals`).get() as { cnt: number };
    assert.equal(count.cnt, 1, 'Recent inactive terminal should not be purged');
  });

  it('does NOT delete active terminals regardless of age', () => {
    db.prepare(`
      INSERT INTO terminals (id, project_id, pid, status, last_active)
      VALUES (1, 1, 100, 'active', datetime('now', '-7200 seconds'))
    `).run();

    purgeOldInactiveTerminals(db, 3600);

    const count = db.prepare(`SELECT COUNT(*) as cnt FROM terminals`).get() as { cnt: number };
    assert.equal(count.cnt, 1, 'Active terminal should never be purged');
  });

  it('keeps terminals from different projects untouched', () => {
    // Two terminals, different projects, both inactive + old
    db.prepare(`INSERT INTO projects (id, name, path) VALUES (2, 'other', '/tmp/other')`).run();
    db.prepare(`
      INSERT INTO terminals (id, project_id, pid, status, last_active)
      VALUES (1, 1, 100, 'inactive', datetime('now', '-7200 seconds'))
    `).run();
    db.prepare(`
      INSERT INTO terminals (id, project_id, pid, status, last_active)
      VALUES (2, 2, 100, 'inactive', datetime('now', '-7200 seconds'))
    `).run();

    const purged = purgeOldInactiveTerminals(db, 3600);
    assert.equal(purged, 2, 'Both old inactive terminals should be purged');

    const count = db.prepare(`SELECT COUNT(*) as cnt FROM terminals`).get() as { cnt: number };
    assert.equal(count.cnt, 0);
  });
});
