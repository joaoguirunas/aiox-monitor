import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { initSchema } from '../src/lib/schema';

// ─── In-memory DB with schema ────────────────────────────────────────────────

let db: DatabaseSync;

function seedTestData() {
  // Project
  db.prepare(`INSERT INTO projects (id, name, path) VALUES (1, 'test-project', '/tmp/test')`).run();

  // Agent
  db.prepare(`INSERT INTO agents (id, project_id, name, display_name, status) VALUES (1, 1, '@dev', 'Dex', 'working')`).run();

  // Sessions
  db.prepare(`INSERT INTO sessions (id, project_id, agent_id, started_at, ended_at, event_count, status) VALUES
    (1, 1, 1, '2026-03-18 10:00:00', '2026-03-18 10:05:00', 5, 'completed'),
    (2, 1, 1, '2026-03-18 11:00:00', '2026-03-18 11:10:00', 3, 'completed'),
    (3, 1, 1, '2026-03-18 12:00:00', NULL, 2, 'active')
  `).run();

  // Events for session 1
  db.prepare(`INSERT INTO events (id, project_id, agent_id, session_id, type, tool, input_summary, created_at) VALUES
    (1, 1, 1, 1, 'UserPromptSubmit', NULL, 'fix the bug', '2026-03-18 10:00:00'),
    (2, 1, 1, 1, 'PreToolUse', 'Read', '/src/main.ts', '2026-03-18 10:01:00'),
    (3, 1, 1, 1, 'PostToolUse', 'Read', 'file contents', '2026-03-18 10:01:05'),
    (4, 1, 1, 1, 'PreToolUse', 'Edit', '/src/main.ts', '2026-03-18 10:02:00'),
    (5, 1, 1, 1, 'Stop', NULL, 'Fixed the bug', '2026-03-18 10:05:00')
  `).run();

  // Events for session 2
  db.prepare(`INSERT INTO events (id, project_id, agent_id, session_id, type, tool, input_summary, created_at) VALUES
    (6, 1, 1, 2, 'UserPromptSubmit', NULL, 'add tests', '2026-03-18 11:00:00'),
    (7, 1, 1, 2, 'PreToolUse', 'Write', '/tests/test.ts', '2026-03-18 11:01:00'),
    (8, 1, 1, 2, 'Stop', NULL, 'Tests added', '2026-03-18 11:10:00')
  `).run();

  // Events for session 3 (active, no Stop)
  db.prepare(`INSERT INTO events (id, project_id, agent_id, session_id, type, tool, input_summary, created_at) VALUES
    (9, 1, 1, 3, 'UserPromptSubmit', NULL, 'refactor code', '2026-03-18 12:00:00'),
    (10, 1, 1, 3, 'PreToolUse', 'Grep', 'search pattern', '2026-03-18 12:01:00')
  `).run();
}

// ─── Helper: replicate query logic from queries.ts ───────────────────────────

type Row = Record<string, unknown>;

interface SessionFilters {
  projectId?: number;
  agentId?: number;
  status?: string;
  since?: string;
  until?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

interface EventFilters {
  projectId?: number;
  type?: string;
  since?: string;
  until?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSessions(filters: SessionFilters = {}): { sessions: any[]; total: number; hasMore: boolean } {
  const conditions: string[] = [];
  const params: (string | number | null)[] = [];

  if (filters.projectId !== undefined) { conditions.push('s.project_id = ?'); params.push(filters.projectId); }
  if (filters.agentId !== undefined) { conditions.push('s.agent_id = ?'); params.push(filters.agentId); }
  if (filters.status !== undefined) { conditions.push('s.status = ?'); params.push(filters.status); }
  if (filters.since !== undefined) { conditions.push('s.started_at >= ?'); params.push(filters.since); }
  if (filters.until !== undefined) { conditions.push('s.started_at <= ?'); params.push(filters.until); }
  if (filters.search) {
    conditions.push('EXISTS (SELECT 1 FROM events e WHERE e.session_id = s.id AND (e.input_summary LIKE ? OR e.output_summary LIKE ?))');
    const like = `%${filters.search}%`;
    params.push(like, like);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit ?? 20;
  const offset = filters.offset ?? 0;

  const countRow = db.prepare(`SELECT COUNT(*) AS total FROM sessions s ${where}`).get(...params) as Row;
  const total = (countRow.total as number) ?? 0;

  const rawRows = db.prepare(`
    SELECT s.*,
      (SELECT e.input_summary FROM events e WHERE e.session_id = s.id AND e.type = 'UserPromptSubmit' ORDER BY e.id ASC LIMIT 1) as prompt,
      (SELECT e.input_summary FROM events e WHERE e.session_id = s.id AND e.type IN ('Stop', 'SubagentStop') ORDER BY e.id DESC LIMIT 1) as response,
      (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id AND e.type = 'PreToolUse') as tool_count,
      (SELECT GROUP_CONCAT(DISTINCT e.tool) FROM events e WHERE e.session_id = s.id AND e.tool IS NOT NULL AND e.type IN ('PreToolUse', 'PostToolUse')) as tools
    FROM sessions s ${where}
    ORDER BY s.started_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as Row[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessions = rawRows.map((s: any) => ({
    ...s,
    tools: s.tools ? (s.tools as string).split(',') : [],
  }));

  return { sessions, total, hasMore: offset + sessions.length < total };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSessionEvents(sessionId: number): any[] {
  return db.prepare(`SELECT * FROM events WHERE session_id = ? ORDER BY id ASC`).all(sessionId) as Row[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getEvents(filters: EventFilters = {}): { events: any[]; total: number; hasMore: boolean } {
  const conditions: string[] = [];
  const params: (string | number | null)[] = [];

  if (filters.projectId !== undefined) { conditions.push('project_id = ?'); params.push(filters.projectId); }
  if (filters.type !== undefined) { conditions.push('type = ?'); params.push(filters.type); }
  if (filters.since !== undefined) { conditions.push('created_at >= ?'); params.push(filters.since); }
  if (filters.until !== undefined) { conditions.push('created_at <= ?'); params.push(filters.until); }
  if (filters.search) {
    conditions.push('(input_summary LIKE ? OR output_summary LIKE ?)');
    const like = `%${filters.search}%`;
    params.push(like, like);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;

  const countRow = db.prepare(`SELECT COUNT(*) AS total FROM events ${where}`).get(...params) as Row;
  const total = (countRow.total as number) ?? 0;

  const events = db.prepare(`SELECT * FROM events ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as Row[];

  return { events, total, hasMore: offset + events.length < total };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

before(() => {
  db = new DatabaseSync(':memory:');
  initSchema(db);
  seedTestData();
});

describe('getSessions', () => {
  it('returns all sessions with aggregated data', () => {
    const result = getSessions({ projectId: 1 });
    assert.equal(result.total, 3);
    assert.equal(result.sessions.length, 3);
    // Ordered by started_at DESC — session 3 first
    assert.equal(result.sessions[0].id, 3);
    assert.equal(result.sessions[0].prompt, 'refactor code');
    assert.equal(result.sessions[0].response, null); // no Stop event
  });

  it('returns prompt and response from events', () => {
    const result = getSessions({ projectId: 1 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session1 = result.sessions.find((s: any) => s.id === 1)!;
    assert.equal(session1.prompt, 'fix the bug');
    assert.equal(session1.response, 'Fixed the bug');
    assert.equal(session1.tool_count, 2); // 2 PreToolUse events
    assert.ok(Array.isArray(session1.tools));
    assert.ok((session1.tools as string[]).includes('Read'));
    assert.ok((session1.tools as string[]).includes('Edit'));
  });

  it('filters by status', () => {
    const result = getSessions({ status: 'active' });
    assert.equal(result.total, 1);
    assert.equal(result.sessions[0].id, 3);
  });

  it('filters by since/until', () => {
    const result = getSessions({ since: '2026-03-18 11:00:00', until: '2026-03-18 11:30:00' });
    assert.equal(result.total, 1);
    assert.equal(result.sessions[0].id, 2);
  });

  it('filters by search (event content)', () => {
    const result = getSessions({ search: 'tests' });
    assert.equal(result.total, 1);
    assert.equal(result.sessions[0].id, 2);
  });

  it('pagination returns correct totals', () => {
    const page1 = getSessions({ limit: 2, offset: 0 });
    assert.equal(page1.sessions.length, 2);
    assert.equal(page1.total, 3);
    assert.equal(page1.hasMore, true);

    const page2 = getSessions({ limit: 2, offset: 2 });
    assert.equal(page2.sessions.length, 1);
    assert.equal(page2.hasMore, false);
  });
});

describe('getSessionEvents', () => {
  it('returns all events ordered by id ASC', () => {
    const events = getSessionEvents(1);
    assert.equal(events.length, 5);
    assert.equal(events[0].type, 'UserPromptSubmit');
    assert.equal(events[4].type, 'Stop');
    // Verify ASC order
    for (let i = 1; i < events.length; i++) {
      assert.ok((events[i].id as number) > (events[i - 1].id as number));
    }
  });

  it('returns empty array for non-existent session', () => {
    const events = getSessionEvents(999);
    assert.equal(events.length, 0);
  });
});

describe('getEvents with pagination', () => {
  it('returns all events without filters', () => {
    const result = getEvents();
    assert.equal(result.total, 10);
    assert.equal(result.events.length, 10);
    assert.equal(result.hasMore, false);
  });

  it('pagination with offset/limit', () => {
    const page1 = getEvents({ limit: 4, offset: 0 });
    assert.equal(page1.events.length, 4);
    assert.equal(page1.total, 10);
    assert.equal(page1.hasMore, true);

    const page2 = getEvents({ limit: 4, offset: 4 });
    assert.equal(page2.events.length, 4);
    assert.equal(page2.hasMore, true);

    const page3 = getEvents({ limit: 4, offset: 8 });
    assert.equal(page3.events.length, 2);
    assert.equal(page3.hasMore, false);
  });

  it('filters by type', () => {
    const result = getEvents({ type: 'PreToolUse' });
    assert.equal(result.total, 4); // 4 PreToolUse events (2 in session 1, 1 in session 2, 1 in session 3)
  });

  it('filters by since/until', () => {
    const result = getEvents({ since: '2026-03-18 11:00:00', until: '2026-03-18 11:30:00' });
    assert.equal(result.total, 3); // session 2 events
  });

  it('filters by search', () => {
    const result = getEvents({ search: 'bug' });
    assert.equal(result.total, 2); // 'fix the bug' + 'Fixed the bug'
  });
});
