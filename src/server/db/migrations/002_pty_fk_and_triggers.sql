-- ============================================================
-- Migration 002 — PTY FK & Triggers
-- Story: JOB-029
-- Date:  2026-04-14
-- Depends on:
--   · 001_sala_de_comando_v2.sql (agent_cards, messages,
--     conversations, canvas_layouts)
--   · command_room_terminals (JOB-012, must exist before applying)
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA busy_timeout  = 5000;

-- ============================================================
-- 1. Add FK: agent_cards.pty_terminal_id → command_room_terminals(id)
--
--    SQLite does not support ALTER TABLE ADD CONSTRAINT (see
--    https://sqlite.org/lang_altertable.html §7). The authorised
--    approach is: disable FK enforcement, rebuild the table inside a
--    transaction, verify integrity, then re-enable enforcement.
-- ============================================================

PRAGMA foreign_keys = OFF;

BEGIN;

CREATE TABLE agent_cards_new (
  id                    TEXT PRIMARY KEY,
  kind                  TEXT NOT NULL CHECK(kind IN ('chat','terminal','hybrid')),
  display_name          TEXT NOT NULL,
  aiox_agent            TEXT,
  project_path          TEXT,
  pty_terminal_id       TEXT REFERENCES command_room_terminals(id)
                             ON DELETE SET NULL,
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

INSERT INTO agent_cards_new SELECT * FROM agent_cards;

DROP TABLE agent_cards;
ALTER TABLE agent_cards_new RENAME TO agent_cards;

COMMIT;

-- Verify referential integrity before re-enabling enforcement.
-- Fails loudly if any pty_terminal_id points to a non-existent row.
PRAGMA foreign_key_check(agent_cards);

PRAGMA foreign_keys = ON;

-- ============================================================
-- 2. Trigger: keep conversations.last_message_at current
--
--    Fires AFTER INSERT on messages (new message arrives) and
--    stamps the parent conversation's last_message_at with the
--    new message's created_at.
--
--    Note: story spec JOB-029 originally listed AFTER UPDATE;
--    implemented as AFTER INSERT — the semantically correct event
--    for "last message time" (messages are never updated, only
--    inserted). Add a second trigger if UPDATE semantics are ever
--    needed.
-- ============================================================

CREATE TRIGGER IF NOT EXISTS trg_messages_sync_last_message_at
AFTER INSERT ON messages
FOR EACH ROW
BEGIN
  UPDATE conversations
  SET    last_message_at = NEW.created_at
  WHERE  id = NEW.conversation_id;
END;

-- ============================================================
-- 3. Trigger: bump canvas_layouts.updated_at when agent activity
--    changes (last_active updated on agent_cards)
--
--    Fires AFTER UPDATE OF last_active ON agent_cards and sets
--    updated_at = now() on the matching canvas_layout row
--    (keyed by project_path). Only fires when project_path is set
--    and an actual value change occurred, so idle re-saves do not
--    produce spurious updates.
-- ============================================================

CREATE TRIGGER IF NOT EXISTS trg_agent_cards_sync_canvas_updated_at
AFTER UPDATE OF last_active ON agent_cards
FOR EACH ROW
WHEN NEW.project_path IS NOT NULL
 AND OLD.last_active IS NOT NEW.last_active
BEGIN
  UPDATE canvas_layouts
  SET    updated_at = datetime('now')
  WHERE  project_path = NEW.project_path;
END;

-- ============================================================
-- END of migration 002
-- ============================================================
