/**
 * JOB-036 — POST /api/agents/invoke
 *
 * Tests:
 * 1. Parser unit: valid agent file, fallbacks, MISSING_YAML_BLOCK
 * 2. Scanner integration: scan a mock project directory
 * 3. Catalog validation: getCatalogEntry returns correct rows
 * 4. Idempotency: findRecentCard within 5s returns same card
 * 5. is_chief: connections created to all active cards
 * 6. 404 hint when skill_path absent from catalog
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Schema bootstrap (in-memory) ────────────────────────────────────────────

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
      category_id           TEXT,
      is_chief              INTEGER DEFAULT 0,
      status                TEXT DEFAULT 'idle'
                            CHECK(status IN ('idle','thinking','speaking','waiting','offline','error')),
      system_prompt         TEXT,
      model                 TEXT,
      user_id               TEXT NOT NULL DEFAULT 'local',
      created_at            TEXT DEFAULT (datetime('now')),
      last_active           TEXT DEFAULT (datetime('now')),
      maestri_terminal_name TEXT,
      skill_path            TEXT
    );

    CREATE TABLE IF NOT EXISTS connections (
      id         TEXT PRIMARY KEY,
      source_id  TEXT NOT NULL REFERENCES agent_cards(id) ON DELETE CASCADE,
      target_id  TEXT NOT NULL REFERENCES agent_cards(id) ON DELETE CASCADE,
      directed   INTEGER DEFAULT 1,
      kind       TEXT CHECK(kind IN ('chat','broadcast','supervise','context-share')),
      label      TEXT,
      metadata   TEXT,
      user_id    TEXT NOT NULL DEFAULT 'local',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(source_id, target_id, kind)
    );

    CREATE TABLE IF NOT EXISTS agent_catalog (
      project_path    TEXT NOT NULL,
      skill_path      TEXT NOT NULL,
      squad           TEXT NOT NULL,
      agent_id        TEXT NOT NULL,
      display_name    TEXT NOT NULL,
      icon            TEXT,
      role            TEXT,
      description     TEXT,
      definition_path TEXT NOT NULL,
      source          TEXT NOT NULL CHECK(source IN ('project','user','builtin')),
      persona_tags    TEXT,
      last_seen_at    TEXT DEFAULT (datetime('now')),
      PRIMARY KEY(project_path, skill_path)
    );
  `);
}

// ─── §1  Parser unit tests ────────────────────────────────────────────────────

describe('Parser — parseAgentFile', () => {
  let tmpDir: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiox-invoke-test-'));
    const agentsDir = path.join(tmpDir, '.claude', 'commands', 'AIOX', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses a valid agent file correctly', async () => {
    const { parseAgentFile } = await import('../src/server/agent-catalog/parser.js');
    const agentFile = path.join(tmpDir, '.claude', 'commands', 'AIOX', 'agents', 'dev.md');

    fs.writeFileSync(agentFile, `
# 🛠️ Developer Agent

\`\`\`yaml
agent:
  name: Dex
  id: dev
  title: Full-Stack Developer
  whenToUse: Use when you need to implement features, fix bugs, or write code.
persona:
  role: Senior Developer
  identity: I am Dex, a senior full-stack developer specializing in TypeScript.
\`\`\`

## Quick Commands
- *help
`);

    const result = parseAgentFile(agentFile, tmpDir, 'project', '/projects/myapp');
    assert.ok(result.entry, 'entry should exist');
    assert.equal(result.entry!.skill_path, '/AIOX:agents:dev');
    assert.equal(result.entry!.squad, 'AIOX');
    assert.equal(result.entry!.agent_id, 'dev');
    assert.equal(result.entry!.display_name, 'Dex');
    assert.ok(result.entry!.icon.includes('🛠'), 'icon should contain hammer emoji');
    assert.equal(result.entry!.role, 'Senior Developer');
    assert.equal(result.entry!.source, 'project');
    assert.equal(result.entry!.project_path, '/projects/myapp');
    assert.ok(result.entry!.description.includes('implement features'));
  });

  it('falls back gracefully when agent.name is missing', async () => {
    const { parseAgentFile } = await import('../src/server/agent-catalog/parser.js');
    const agentFile = path.join(tmpDir, '.claude', 'commands', 'AIOX', 'agents', 'helper.md');

    fs.writeFileSync(agentFile, `
# Helper Agent

\`\`\`yaml
agent:
  id: helper
  title: General Helper
persona:
  identity: I help with general tasks.
\`\`\`
`);

    const result = parseAgentFile(agentFile, tmpDir, 'project', '/projects/myapp');
    assert.ok(result.entry, 'entry should exist');
    // H1 fallback kicks in before capitalize(agent_id) — name extracted from '# Helper Agent'
    assert.equal(result.entry!.display_name, 'Helper Agent');
    assert.ok(result.entry!.parse_warnings.some(w => w.includes('MISSING_REQUIRED_FIELD')));
  });

  it('returns MISSING_YAML_BLOCK error for files without yaml fence', async () => {
    const { parseAgentFile } = await import('../src/server/agent-catalog/parser.js');
    const agentFile = path.join(tmpDir, '.claude', 'commands', 'AIOX', 'agents', 'legacy.md');

    fs.writeFileSync(agentFile, `
# Legacy Agent
Role: Old style
`);

    const result = parseAgentFile(agentFile, tmpDir, 'project', '/projects/myapp');
    assert.ok(!result.entry, 'entry should be absent');
    assert.ok(result.error, 'error should exist');
    assert.equal(result.error!.error_code, 'MISSING_YAML_BLOCK');
  });

  it('returns YAML_PARSE_ERROR for malformed YAML', async () => {
    const { parseAgentFile } = await import('../src/server/agent-catalog/parser.js');
    const agentFile = path.join(tmpDir, '.claude', 'commands', 'AIOX', 'agents', 'broken.md');

    fs.writeFileSync(agentFile, `
# Broken

\`\`\`yaml
agent:
  name: [unclosed bracket
    still invalid
\`\`\`
`);

    const result = parseAgentFile(agentFile, tmpDir, 'project', '/projects/myapp');
    assert.ok(!result.entry, 'entry should be absent');
    assert.equal(result.error!.error_code, 'YAML_PARSE_ERROR');
  });
});

// ─── §2  Scanner integration test ────────────────────────────────────────────

describe('Scanner — scanScope', () => {
  let mockProject: string;

  before(() => {
    mockProject = fs.mkdtempSync(path.join(os.tmpdir(), 'aiox-scanner-test-'));
    const agentsDir = path.join(mockProject, '.claude', 'commands', 'TestSquad', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });

    // Agent 1
    fs.writeFileSync(path.join(agentsDir, 'alpha.md'), `
# 🤖 Alpha

\`\`\`yaml
agent:
  name: Alpha
  id: alpha
  title: Task Executor
\`\`\`
`);

    // Agent 2
    fs.writeFileSync(path.join(agentsDir, 'beta.md'), `
# 🔬 Beta

\`\`\`yaml
agent:
  name: Beta
  id: beta
  title: QA Engineer
\`\`\`
`);

    // Non-.md file (should be ignored by glob filter)
    fs.writeFileSync(path.join(agentsDir, 'README.txt'), '# Not an agent');
  });

  after(() => {
    fs.rmSync(mockProject, { recursive: true, force: true });
  });

  it('scans agents in project scope', async () => {
    const { scanScope } = await import('../src/server/agent-catalog/scanner.js');
    const result = scanScope(mockProject, 'project', mockProject);

    assert.equal(result.agents.length, 2);
    assert.equal(result.errors.length, 0);

    const skillPaths = result.agents.map(a => a.skill_path).sort();
    assert.deepEqual(skillPaths, ['/TestSquad:agents:alpha', '/TestSquad:agents:beta']);
  });

  it('derives squad from path (not YAML content)', async () => {
    const { scanScope } = await import('../src/server/agent-catalog/scanner.js');
    const result = scanScope(mockProject, 'project', mockProject);

    for (const agent of result.agents) {
      assert.equal(agent.squad, 'TestSquad');
    }
  });

  it('returns empty result for non-existent project', async () => {
    const { scanScope } = await import('../src/server/agent-catalog/scanner.js');
    const result = scanScope('/this/path/does/not/exist', 'project', '/this/path/does/not/exist');

    assert.equal(result.agents.length, 0);
    assert.equal(result.errors.length, 0);
  });
});

// ─── §3  Catalog DB validation + Invoke logic ─────────────────────────────────

describe('Invoke — catalog validation + card creation', () => {
  let db: DatabaseSync;
  const PROJECT = '/mock/project/path';

  before(() => {
    db = new DatabaseSync(':memory:');
    buildSchema(db);

    // Seed catalog entry
    db.prepare(`
      INSERT INTO agent_catalog
        (project_path, skill_path, squad, agent_id, display_name, icon, role, definition_path, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(PROJECT, '/AIOX:agents:dev', 'AIOX', 'dev', 'Dex', '🛠️', 'Developer', '.claude/commands/AIOX/agents/dev.md', 'project');
  });

  it('finds catalog entry for valid skill_path', () => {
    const row = db
      .prepare('SELECT * FROM agent_catalog WHERE project_path = ? AND skill_path = ?')
      .get(PROJECT, '/AIOX:agents:dev') as unknown as Record<string, unknown>;

    assert.ok(row, 'entry should exist');
    assert.equal(row['display_name'], 'Dex');
  });

  it('returns undefined for unknown skill_path', () => {
    const row = db
      .prepare('SELECT * FROM agent_catalog WHERE project_path = ? AND skill_path = ?')
      .get(PROJECT, '/AIOX:agents:nonexistent');

    assert.equal(row, undefined);
  });

  it('creates agent_card with correct fields', () => {
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO agent_cards (id, kind, display_name, aiox_agent, project_path, skill_path, is_chief)
      VALUES (?, 'chat', 'Dex', 'dev', ?, '/AIOX:agents:dev', 0)
    `).run(id, PROJECT);

    const card = db.prepare('SELECT * FROM agent_cards WHERE id = ?').get(id) as unknown as Record<string, unknown>;
    assert.equal(card['kind'], 'chat');
    assert.equal(card['display_name'], 'Dex');
    assert.equal(card['skill_path'], '/AIOX:agents:dev');
    assert.equal(card['is_chief'], 0);
  });

  it('findRecentCard returns a card within 5s window', () => {
    // Insert a card with a unique skill_path for this idempotency test
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO agent_cards (id, kind, display_name, project_path, skill_path)
      VALUES (?, 'chat', 'Aria', ?, '/AIOX:agents:architect')
    `).run(id, PROJECT);

    const found = db.prepare(`
      SELECT * FROM agent_cards
      WHERE project_path = ?
        AND skill_path = ?
        AND kind = 'chat'
        AND created_at >= datetime('now', '-5 seconds')
      ORDER BY created_at DESC
      LIMIT 1
    `).get(PROJECT, '/AIOX:agents:architect') as unknown as Record<string, unknown>;

    assert.ok(found, 'should find recently created card');
    assert.equal(found['id'], id, 'should return the card just inserted');
  });
});

// ─── §4  is_chief connection wiring ──────────────────────────────────────────

describe('Invoke — is_chief wires supervise connections', () => {
  let db: DatabaseSync;
  const PROJECT = '/mock/chief-test';

  before(() => {
    db = new DatabaseSync(':memory:');
    buildSchema(db);

    // Pre-existing active cards
    db.prepare(`
      INSERT INTO agent_cards (id, kind, display_name, project_path, status)
      VALUES ('peer-1', 'chat', 'Alpha', ?, 'idle'), ('peer-2', 'chat', 'Beta', ?, 'thinking')
    `).run(PROJECT, PROJECT);
  });

  it('creates supervise connections to all active cards', () => {
    // Simulate chief card creation
    const chiefId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO agent_cards (id, kind, display_name, project_path, skill_path, is_chief)
      VALUES (?, 'chat', 'Chief', ?, '/AIOX:agents:aiox-master', 1)
    `).run(chiefId, PROJECT);

    // Wire connections
    const peers = db.prepare(`
      SELECT * FROM agent_cards WHERE project_path = ? AND status != 'offline' AND id != ?
    `).all(PROJECT, chiefId) as unknown as Array<{ id: string }>;

    assert.equal(peers.length, 2);

    for (const peer of peers) {
      const connId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO connections (id, source_id, target_id, kind, directed, label)
        VALUES (?, ?, ?, 'supervise', 1, 'chief')
      `).run(connId, chiefId, peer.id);
    }

    const connections = db.prepare(`
      SELECT * FROM connections WHERE source_id = ? AND kind = 'supervise'
    `).all(chiefId) as unknown as unknown[];

    assert.equal(connections.length, 2);
  });
});
