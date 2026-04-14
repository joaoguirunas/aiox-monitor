-- ============================================================
-- Migration 001 — Sala de Comando v2
-- Story: 9.1 · JOB-013
-- Date:  2026-04-14
-- Schema ref: docs/SALA-DE-COMANDO-v2-MASTER-PLAN.md §3.1 + §2.5.5
-- ============================================================
-- NOTE: pty_terminal_id is plain TEXT (no FK) intentionally.
-- The target table `command_room_terminals` is created in JOB-012
-- (branch feature/sala-comando-v2). FK will be added in 002_add_pty_fk.sql.
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

-- ----------------------------------------------------------
-- 1. agent_cards
--    Canvas card — decoupled from PTY
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_cards (
  id                    TEXT PRIMARY KEY,
  kind                  TEXT NOT NULL CHECK(kind IN ('chat','terminal','hybrid')),
  display_name          TEXT NOT NULL,
  aiox_agent            TEXT,
  project_path          TEXT,
  pty_terminal_id       TEXT,                          -- soft ref; FK added after JOB-012
  category_id           TEXT,
  is_chief              INTEGER DEFAULT 0,
  status                TEXT DEFAULT 'idle'
                        CHECK(status IN ('idle','thinking','speaking','waiting','offline','error')),
  system_prompt         TEXT,
  model                 TEXT,
  user_id               TEXT NOT NULL DEFAULT 'local',
  created_at            TEXT DEFAULT (datetime('now')),
  last_active           TEXT DEFAULT (datetime('now')),
  maestri_terminal_name TEXT,                          -- §3.2b: maestri CLI terminal name
  skill_path            TEXT                           -- §2.5.5: '/squad:agents:id'
);

-- ----------------------------------------------------------
-- 2. connections
--    First-class edge replacing linked_terminal_ids JSON
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS connections (
  id         TEXT PRIMARY KEY,
  source_id  TEXT NOT NULL REFERENCES agent_cards(id) ON DELETE CASCADE,
  target_id  TEXT NOT NULL REFERENCES agent_cards(id) ON DELETE CASCADE,
  directed   INTEGER DEFAULT 1,
  kind       TEXT CHECK(kind IN ('chat','broadcast','supervise','context-share')),
  label      TEXT,
  metadata   TEXT,                                     -- JSON
  user_id    TEXT NOT NULL DEFAULT 'local',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(source_id, target_id, kind)
);

-- ----------------------------------------------------------
-- 3. conversations
--    Chat thread between 1+ agent cards
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id              TEXT PRIMARY KEY,
  kind            TEXT CHECK(kind IN ('peer','group','broadcast','chief-thread')),
  title           TEXT,
  user_id         TEXT NOT NULL DEFAULT 'local',
  created_at      TEXT DEFAULT (datetime('now')),
  last_message_at TEXT
);

-- ----------------------------------------------------------
-- 4. conversation_participants
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  agent_card_id   TEXT NOT NULL REFERENCES agent_cards(id) ON DELETE CASCADE,
  role            TEXT CHECK(role IN ('member','owner','observer')),
  PRIMARY KEY(conversation_id, agent_card_id)
);

-- ----------------------------------------------------------
-- 5. messages
--    Replaces ChatMessageStore (in-memory → persistent)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       TEXT REFERENCES agent_cards(id) ON DELETE SET NULL,
  sender_role     TEXT CHECK(sender_role IN ('chief','agent','system','tool','user')),
  content         TEXT NOT NULL,
  artifacts       TEXT,                                -- JSON attachments / outputs
  in_reply_to     TEXT REFERENCES messages(id) ON DELETE SET NULL,
  user_id         TEXT NOT NULL DEFAULT 'local',
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_msg_conv_created ON messages(conversation_id, created_at);

-- ----------------------------------------------------------
-- 6. canvas_layouts
--    Persisted visual layout per project
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS canvas_layouts (
  project_path   TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL DEFAULT 'local',
  viewport       TEXT DEFAULT '{"x":0,"y":0,"zoom":1}',
  node_positions TEXT DEFAULT '{}',
  scenario_name  TEXT,
  updated_at     TEXT DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------
-- 7. agent_catalog
--    Dynamic cache of agents discovered from disk
--    Rebuilt by Agent Catalog Service scanner (§2.5.4)
--    Seed is intentionally empty — populated by scanner
-- ----------------------------------------------------------
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
  persona_tags    TEXT,                                -- JSON array
  last_seen_at    TEXT DEFAULT (datetime('now')),
  PRIMARY KEY(project_path, skill_path)
);

CREATE INDEX IF NOT EXISTS idx_catalog_project ON agent_catalog(project_path);

-- ----------------------------------------------------------
-- 8. agent_groups
--    Cache of groups discovered from disk
--    Rebuilt by scanner — never source of truth
--    Seed is intentionally empty — populated by scanner
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_groups (
  project_path       TEXT NOT NULL,
  group_id           TEXT NOT NULL,
  name               TEXT NOT NULL,
  description        TEXT,
  squad              TEXT NOT NULL,
  member_skill_paths TEXT NOT NULL,                    -- JSON array
  topology           TEXT DEFAULT 'chief-hub'
                     CHECK(topology IN ('none','chief-hub','mesh','pipeline')),
  source             TEXT NOT NULL CHECK(source IN ('project','user','auto')),
  definition_path    TEXT,                             -- NULL for auto-generated groups
  last_seen_at       TEXT DEFAULT (datetime('now')),
  PRIMARY KEY(project_path, group_id)
);

CREATE INDEX IF NOT EXISTS idx_groups_project ON agent_groups(project_path);

-- ============================================================
-- END of migration 001
-- ============================================================
