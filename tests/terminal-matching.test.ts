import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { createTestDb } from './helpers/test-db';

// ─── Path conversion logic (replicated from jsonl-watcher.ts:78) ────────────

function pathToClaudeDir(projectPath: string): string {
  return '-' + projectPath.slice(1).replace(/\//g, '-');
}

// ─── DB helpers (replicated from jsonl-watcher.ts, parameterized with db) ───

function buildProjectPathCache(db: DatabaseSync): Map<string, number> {
  const projects = db.prepare(`SELECT id, path FROM projects`).all() as Record<string, unknown>[];
  const cache = new Map<string, number>();
  for (const proj of projects) {
    const projPath = proj.path as string;
    const claudeFormat = '-' + (projPath as string).slice(1).replace(/\//g, '-');
    cache.set(claudeFormat, proj.id as number);
  }
  return cache;
}

function findTerminalByProjectDir(
  db: DatabaseSync,
  projectDirName: string,
): { id: number; project_id: number } | null {
  const cache = buildProjectPathCache(db);
  const projectId = cache.get(projectDirName);
  if (projectId === undefined) return null;

  const countRow = db.prepare(
    `SELECT COUNT(*) as cnt FROM terminals WHERE project_id = ? AND status != 'inactive'`,
  ).get(projectId) as { cnt: number } | undefined;
  if ((countRow?.cnt ?? 0) > 1) return null;

  const row = db.prepare(
    `SELECT id, project_id FROM terminals WHERE project_id = ? AND status != 'inactive' ORDER BY last_active DESC LIMIT 1`,
  ).get(projectId) as Record<string, unknown> | undefined;
  if (row) return { id: row.id as number, project_id: row.project_id as number };
  return null;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

let db: DatabaseSync;

beforeEach(() => {
  db = createTestDb();
});

describe('pathToClaudeDir — path conversion', () => {
  it('converts /Users/joaoramos/Desktop/aiox-monitor to Claude format', () => {
    const result = pathToClaudeDir('/Users/joaoramos/Desktop/aiox-monitor');
    assert.equal(result, '-Users-joaoramos-Desktop-aiox-monitor');
  });

  it('converts path without hyphens correctly', () => {
    const result = pathToClaudeDir('/Users/joaoramos/Desktop/myapp');
    assert.equal(result, '-Users-joaoramos-Desktop-myapp');
  });

  it('converts path with multiple hyphens correctly', () => {
    const result = pathToClaudeDir('/Users/joaoramos/my-complex-app/src');
    assert.equal(result, '-Users-joaoramos-my-complex-app-src');
  });
});

describe('findTerminalByProjectDir', () => {
  it('returns the correct terminal for a project with hyphens in path', () => {
    db.prepare(`INSERT INTO projects (id, name, path) VALUES (1, 'aiox-monitor', '/Users/joaoramos/Desktop/aiox-monitor')`).run();
    db.prepare(`INSERT INTO terminals (id, project_id, pid, status) VALUES (10, 1, 12345, 'active')`).run();

    const result = findTerminalByProjectDir(db, '-Users-joaoramos-Desktop-aiox-monitor');
    assert.ok(result);
    assert.equal(result.id, 10);
    assert.equal(result.project_id, 1);
  });

  it('returns null when no project matches the dir name', () => {
    db.prepare(`INSERT INTO projects (id, name, path) VALUES (1, 'other', '/Users/joaoramos/other')`).run();
    const result = findTerminalByProjectDir(db, '-Users-joaoramos-Desktop-aiox-monitor');
    assert.equal(result, null);
  });

  it('returns null when multiple active terminals exist for the project', () => {
    db.prepare(`INSERT INTO projects (id, name, path) VALUES (1, 'aiox-monitor', '/Users/joaoramos/Desktop/aiox-monitor')`).run();
    db.prepare(`INSERT INTO terminals (id, project_id, pid, status) VALUES (10, 1, 111, 'active')`).run();
    db.prepare(`INSERT INTO terminals (id, project_id, pid, status) VALUES (11, 1, 222, 'processing')`).run();

    const result = findTerminalByProjectDir(db, '-Users-joaoramos-Desktop-aiox-monitor');
    assert.equal(result, null);
  });
});

describe('syncSystemTerminals — session_id dedup', () => {
  it('does not create duplicate terminal when session_id already exists', () => {
    db.prepare(`INSERT INTO projects (id, name, path) VALUES (1, 'myapp', '/Users/joaoramos/Desktop/myapp')`).run();
    // Existing terminal with session_id
    db.prepare(`INSERT INTO terminals (id, project_id, pid, session_id, status) VALUES (1, 1, 100, 'iterm-0-0-0', 'active')`).run();

    // Simulate dedup check from syncSystemTerminals:
    // Before creating a new terminal, check if session_id already exists
    const existingSession = db.prepare(
      `SELECT 1 FROM terminals WHERE session_id = ? AND status != 'inactive' LIMIT 1`,
    ).get('iterm-0-0-0');

    assert.ok(existingSession, 'Should find existing terminal by session_id');

    // Verify only 1 terminal exists
    const count = db.prepare(`SELECT COUNT(*) as cnt FROM terminals WHERE project_id = 1`).get() as { cnt: number };
    assert.equal(count.cnt, 1);
  });

  it('allows creation when session_id does not exist in DB', () => {
    db.prepare(`INSERT INTO projects (id, name, path) VALUES (1, 'myapp', '/Users/joaoramos/Desktop/myapp')`).run();
    db.prepare(`INSERT INTO terminals (id, project_id, pid, session_id, status) VALUES (1, 1, 100, 'iterm-0-0-0', 'active')`).run();

    const existingSession = db.prepare(
      `SELECT 1 FROM terminals WHERE session_id = ? AND status != 'inactive' LIMIT 1`,
    ).get('iterm-1-0-0');

    assert.equal(existingSession, undefined, 'Should NOT find terminal for different session_id');
  });
});

describe('terminal without project match', () => {
  it('is ignored when window title does not match any project name', () => {
    db.prepare(`INSERT INTO projects (id, name, path) VALUES (1, 'aiox-monitor', '/Users/joaoramos/Desktop/aiox-monitor')`).run();

    // Simulate syncSystemTerminals project matching logic:
    // A detected terminal with title "randomApp" should NOT match project "aiox-monitor"
    const title = 'randomApp';
    const projects = db.prepare(`SELECT id, name FROM projects`).all() as { id: number; name: string }[];
    const matched = projects.find(p => title.toLowerCase().includes(p.name.toLowerCase()));

    assert.equal(matched, undefined, 'Terminal with unrelated title should not match any project');
  });

  it('matches when window title contains project name', () => {
    db.prepare(`INSERT INTO projects (id, name, path) VALUES (1, 'aiox-monitor', '/Users/joaoramos/Desktop/aiox-monitor')`).run();

    const title = 'Working on aiox-monitor feature';
    const projects = db.prepare(`SELECT id, name FROM projects`).all() as { id: number; name: string }[];
    const matched = projects.find(p => title.toLowerCase().includes(p.name.toLowerCase()));

    assert.ok(matched, 'Terminal title containing project name should match');
    assert.equal(matched!.id, 1);
  });
});
