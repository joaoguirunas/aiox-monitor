import type { DatabaseSync } from 'node:sqlite';

export function initSchema(db: DatabaseSync): void {
  // Enable WAL mode, foreign keys, and busy timeout for all connections
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      path        TEXT NOT NULL UNIQUE,
      detected_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_active TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agents (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      display_name TEXT,
      status       TEXT NOT NULL DEFAULT 'idle'
                   CHECK(status IN ('idle','working','break','offline')),
      current_tool TEXT,
      last_active  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, name)
    );

    CREATE TABLE IF NOT EXISTS terminals (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id         INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      pid                INTEGER NOT NULL,
      session_id         TEXT,
      status             TEXT NOT NULL DEFAULT 'active'
                         CHECK(status IN ('processing','active','inactive')),
      agent_name         TEXT,
      agent_display_name TEXT,
      current_tool       TEXT,
      current_input      TEXT,
      window_title       TEXT,
      first_seen_at      TEXT NOT NULL DEFAULT (datetime('now')),
      last_active        TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, pid)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      agent_id    INTEGER REFERENCES agents(id) ON DELETE SET NULL,
      terminal_id INTEGER REFERENCES terminals(id) ON DELETE SET NULL,
      started_at  TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at    TEXT,
      event_count INTEGER DEFAULT 0,
      status      TEXT DEFAULT 'active'
                  CHECK(status IN ('active','completed','interrupted'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      agent_id       INTEGER REFERENCES agents(id) ON DELETE SET NULL,
      session_id     INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
      terminal_id    INTEGER REFERENCES terminals(id) ON DELETE SET NULL,
      type           TEXT NOT NULL
                     CHECK(type IN ('PreToolUse','PostToolUse','UserPromptSubmit','Stop','SubagentStop')),
      tool           TEXT,
      input_summary  TEXT,
      output_summary TEXT,
      duration_ms    INTEGER,
      raw_payload    TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS company_config (
      id                  INTEGER PRIMARY KEY CHECK(id = 1),
      name                TEXT NOT NULL DEFAULT 'Minha Empresa',
      logo_path           TEXT,
      theme               TEXT NOT NULL DEFAULT 'moderno'
                          CHECK(theme IN ('espacial','moderno','oldschool','cyberpunk')),
      ambient_music       INTEGER NOT NULL DEFAULT 0,
      idle_timeout_lounge INTEGER NOT NULL DEFAULT 300,
      idle_timeout_break  INTEGER NOT NULL DEFAULT 300,
      event_retention_days INTEGER NOT NULL DEFAULT 30,
      updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_projects_path      ON projects(path);
    CREATE INDEX IF NOT EXISTS idx_agents_project     ON agents(project_id);
    CREATE INDEX IF NOT EXISTS idx_agents_status      ON agents(status);
    CREATE INDEX IF NOT EXISTS idx_terminals_project  ON terminals(project_id);
    CREATE INDEX IF NOT EXISTS idx_terminals_status   ON terminals(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_project   ON sessions(project_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_status    ON sessions(status);
    CREATE INDEX IF NOT EXISTS idx_events_project     ON events(project_id);
    CREATE INDEX IF NOT EXISTS idx_events_type        ON events(type);
    CREATE INDEX IF NOT EXISTS idx_events_created     ON events(created_at);
    CREATE INDEX IF NOT EXISTS idx_events_agent       ON events(agent_id);
    CREATE INDEX IF NOT EXISTS idx_events_terminal    ON events(terminal_id);
    CREATE INDEX IF NOT EXISTS idx_events_session_type ON events(session_id, type);
    CREATE INDEX IF NOT EXISTS idx_terminals_session ON terminals(session_id);
  `);

  // Seed singleton row for company_config
  db.exec(`INSERT OR IGNORE INTO company_config (id) VALUES (1)`);

  // Migrations for existing DBs
  try {
    db.exec(`ALTER TABLE company_config ADD COLUMN event_retention_days INTEGER NOT NULL DEFAULT 30`);
  } catch {
    // Column already exists — ignore
  }

  // Migration: terminals new columns + status values
  const terminalMigrations = [
    `ALTER TABLE terminals ADD COLUMN agent_name TEXT`,
    `ALTER TABLE terminals ADD COLUMN agent_display_name TEXT`,
    `ALTER TABLE terminals ADD COLUMN current_tool TEXT`,
    `ALTER TABLE terminals ADD COLUMN current_input TEXT`,
    `ALTER TABLE terminals ADD COLUMN window_title TEXT`,
    `ALTER TABLE terminals ADD COLUMN current_tool_detail TEXT`,
    `ALTER TABLE terminals ADD COLUMN waiting_permission INTEGER DEFAULT 0`,
  ];
  for (const sql of terminalMigrations) {
    try { db.exec(sql); } catch { /* Column already exists */ }
  }

  // Migration: autopilot per terminal
  try { db.exec(`ALTER TABLE terminals ADD COLUMN autopilot INTEGER NOT NULL DEFAULT 0`); } catch { /* exists */ }

  // Migration: agent role and team
  const agentMigrations = [
    `ALTER TABLE agents ADD COLUMN role TEXT`,
    `ALTER TABLE agents ADD COLUMN team TEXT`,
  ];
  for (const sql of agentMigrations) {
    try { db.exec(sql); } catch { /* Column already exists */ }
  }

  // Migrate old 'active' status to 'processing' is not needed —
  // the CHECK constraint update is handled by SQLite allowing existing data
  // We just need to ensure the CHECK allows the new values.
  // SQLite doesn't enforce CHECK on existing rows, so old 'active' rows are fine.

  // ─── Ganga Ativo: migration ────────────────────────────────────────────────
  const gangaMigrations = [
    `ALTER TABLE company_config ADD COLUMN ganga_enabled INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE company_config ADD COLUMN ganga_scope TEXT NOT NULL DEFAULT 'safe-only'`,
  ];
  for (const sql of gangaMigrations) {
    try { db.exec(sql); } catch { /* Column already exists */ }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS autopilot_log (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      terminal_id    INTEGER NOT NULL REFERENCES terminals(id) ON DELETE CASCADE,
      project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      window_title   TEXT,
      agent_name     TEXT,
      action         TEXT NOT NULL CHECK(action IN ('permission_approve','idle_skip','error')),
      detail         TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_autopilot_log_created ON autopilot_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_autopilot_log_terminal ON autopilot_log(terminal_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ganga_log (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      terminal_id    INTEGER REFERENCES terminals(id) ON DELETE SET NULL,
      project_id     INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      prompt_text    TEXT NOT NULL,
      response       TEXT NOT NULL,
      classification TEXT NOT NULL CHECK(classification IN ('safe','blocked','ambiguous')),
      action         TEXT NOT NULL CHECK(action IN ('auto-responded','skipped','blocked')),
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ganga_log_created ON ganga_log(created_at);
  `);

  // ─── Command Room Terminals: migration ────────────────────────────────────
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS command_room_terminals (
        id           TEXT PRIMARY KEY,
        agent_name   TEXT NOT NULL,
        agent_display_name TEXT,
        project_path TEXT NOT NULL,
        cols         INTEGER NOT NULL DEFAULT 220,
        rows         INTEGER NOT NULL DEFAULT 50,
        pty_status   TEXT NOT NULL DEFAULT 'active'
                     CHECK(pty_status IN ('active','idle','closed','crashed')),
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        last_active  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_crt_status ON command_room_terminals(pty_status);
    `);
  } catch { /* Table already exists */ }

  // ─── Terminal Categories: migration ───────────────────────────────────────
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS terminal_categories (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL UNIQUE,
        description   TEXT,
        display_order INTEGER NOT NULL DEFAULT 0,
        color         TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_category_display_order ON terminal_categories(display_order);
    `);
  } catch { /* Table already exists */ }

  // Add category-related columns to command_room_terminals
  const categoryMigrations = [
    `ALTER TABLE command_room_terminals ADD COLUMN category_id TEXT REFERENCES terminal_categories(id) ON DELETE SET NULL`,
    `ALTER TABLE command_room_terminals ADD COLUMN description TEXT`,
    `ALTER TABLE command_room_terminals ADD COLUMN is_chief INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE command_room_terminals ADD COLUMN linked_terminal_ids TEXT DEFAULT '[]'`,
  ];
  for (const sql of categoryMigrations) {
    try { db.exec(sql); } catch { /* Column already exists */ }
  }

  // Create indexes for category-related columns
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_crt_category ON command_room_terminals(category_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_crt_is_chief ON command_room_terminals(is_chief)`);
    // Partial unique index for chief terminal per project
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_crt_unique_chief
             ON command_room_terminals(project_path, is_chief)
             WHERE is_chief = 1`);
  } catch { /* Index already exists */ }
}
