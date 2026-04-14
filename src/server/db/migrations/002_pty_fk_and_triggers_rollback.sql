-- ============================================================
-- Rollback 002 — PTY FK & Triggers
-- Story: JOB-029
-- Reverses: 002_pty_fk_and_triggers.sql
-- ============================================================
-- Drops the two triggers and rebuilds agent_cards without the
-- pty_terminal_id FK, reverting to the 001 definition.
-- All existing data is preserved — no data loss.
-- ============================================================

PRAGMA foreign_keys = OFF;

-- ----------------------------------------------------------
-- 1. Drop triggers (safe to remove before table rebuild)
-- ----------------------------------------------------------

DROP TRIGGER IF EXISTS trg_agent_cards_sync_canvas_updated_at;
DROP TRIGGER IF EXISTS trg_messages_sync_last_message_at;

-- ----------------------------------------------------------
-- 2. Rebuild agent_cards without FK on pty_terminal_id
--    (restores the plain TEXT column from migration 001)
-- ----------------------------------------------------------

BEGIN;

CREATE TABLE agent_cards_old (
  id                    TEXT PRIMARY KEY,
  kind                  TEXT NOT NULL CHECK(kind IN ('chat','terminal','hybrid')),
  display_name          TEXT NOT NULL,
  aiox_agent            TEXT,
  project_path          TEXT,
  pty_terminal_id       TEXT,                          -- soft ref, no FK (migration 001)
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

INSERT INTO agent_cards_old SELECT * FROM agent_cards;

DROP TABLE agent_cards;
ALTER TABLE agent_cards_old RENAME TO agent_cards;

COMMIT;

PRAGMA foreign_keys = ON;

-- ============================================================
-- END of rollback 002
-- ============================================================
