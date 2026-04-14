-- ============================================================
-- Rollback 001 — Sala de Comando v2
-- Story: 9.1 · JOB-013
-- Reverses: 001_sala_de_comando_v2.sql
-- ============================================================
-- WARNING: This drops all data in the v2 tables.
-- Run only to revert migration 001 cleanly.
-- ============================================================

PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_groups_project;
DROP INDEX IF EXISTS idx_catalog_project;
DROP INDEX IF EXISTS idx_msg_conv_created;

DROP TABLE IF EXISTS agent_groups;
DROP TABLE IF EXISTS agent_catalog;
DROP TABLE IF EXISTS canvas_layouts;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversation_participants;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS connections;
DROP TABLE IF EXISTS agent_cards;

PRAGMA foreign_keys = ON;

-- ============================================================
-- END of rollback 001
-- ============================================================
