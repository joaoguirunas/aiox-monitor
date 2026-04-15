-- ============================================================
-- Test Fixture: project-b
-- Story: JOB-043 · Consumer: JOB-044 (Mace Windu / Rey journeys)
-- Project: /fake/project-b
-- Purpose: isolation validation — ensures project-a data does not
--          leak into project-b queries and vice versa.
--
-- Schema source: src/lib/schema.ts (authoritative after JOB-035)
--   canvas_layouts: no user_id (project_path, viewport, node_positions, updated_at)
--   messages: no user_id; sender_role IN ('chief','agent','system','tool')
--
-- Contents (intentionally minimal):
--   agent_catalog  → 2 agents (squad-alpha)
--   agent_groups   → 1 auto-group
--   agent_cards    → 2 invoked cards
--   canvas_layouts → 1 layout
--   connections    → 1 edge
--   conversations  → 1 conversation with 3 messages
--   conv_participants → 2 rows
-- ============================================================

-- ─── agent_catalog ───────────────────────────────────────────────────────────

INSERT INTO agent_catalog
  (project_path, skill_path, squad, agent_id, display_name, icon, role,
   description, definition_path, source, persona_tags, last_seen_at)
VALUES
  ('/fake/project-b', 'squads/squad-alpha/agents/dev', 'squad-alpha', 'dev', 'Dev B',  '💻', 'Full Stack Developer',
   'Dev agent for project-b',
   '/fake/project-b/.aiox-core/squads/squad-alpha/agents/dev.md',
   'project', '["builder"]', '2026-04-14 10:00:00'),

  ('/fake/project-b', 'squads/squad-alpha/agents/qa',  'squad-alpha', 'qa',  'QA B',   '🔍', 'QA Engineer',
   'QA agent for project-b',
   '/fake/project-b/.aiox-core/squads/squad-alpha/agents/qa.md',
   'project', '["reviewer"]', '2026-04-14 10:00:00');

-- ─── agent_groups ─────────────────────────────────────────────────────────────

INSERT INTO agent_groups
  (project_path, group_id, name, description, squad, member_skill_paths,
   topology, source, definition_path, last_seen_at)
VALUES
  ('/fake/project-b', 'grp-b-auto-1', 'squad-alpha (auto)', 'All agents in squad-alpha',
   'squad-alpha',
   '["squads/squad-alpha/agents/dev","squads/squad-alpha/agents/qa"]',
   'chief-hub', 'auto', NULL,
   '2026-04-14 10:00:00');

-- ─── agent_cards ─────────────────────────────────────────────────────────────

INSERT INTO agent_cards
  (id, kind, display_name, aiox_agent, project_path, pty_terminal_id,
   category_id, is_chief, status, model, user_id,
   created_at, last_active, skill_path)
VALUES
  ('ac-b-dev', 'terminal', 'Dev B', 'dev', '/fake/project-b', NULL,
   'cat-builders', 0, 'idle', 'claude-sonnet-4-6', 'local',
   '2026-04-14 09:00:00', '2026-04-14 09:30:00',
   'squads/squad-alpha/agents/dev'),

  ('ac-b-qa', 'chat', 'QA B', 'qa', '/fake/project-b', NULL,
   'cat-quality', 0, 'offline', 'claude-sonnet-4-6', 'local',
   '2026-04-14 09:00:00', '2026-04-14 09:00:00',
   'squads/squad-alpha/agents/qa');

-- ─── canvas_layouts ───────────────────────────────────────────────────────────
-- Note: schema.ts defines canvas_layouts without user_id

INSERT INTO canvas_layouts
  (project_path, viewport, node_positions, updated_at)
VALUES
  ('/fake/project-b',
   '{"x":0,"y":0,"zoom":1}',
   '{"ac-b-dev":{"x":300,"y":300},"ac-b-qa":{"x":600,"y":300}}',
   '2026-04-14 09:30:00');

-- ─── connections (1 edge) ─────────────────────────────────────────────────────

INSERT INTO connections
  (id, source_id, target_id, directed, kind, label, metadata, user_id, created_at)
VALUES
  ('conn-b-1', 'ac-b-dev', 'ac-b-qa', 1, 'chat', 'reviews', NULL, 'local', '2026-04-14 09:05:00');

-- ─── conversations (1) ───────────────────────────────────────────────────────

INSERT INTO conversations
  (id, kind, title, user_id, created_at, last_message_at)
VALUES
  ('conv-b-1', 'peer', 'Dev B ↔ QA B', 'local', '2026-04-14 09:10:00', '2026-04-14 09:20:00');

INSERT INTO conversation_participants (conversation_id, agent_card_id, role)
VALUES
  ('conv-b-1', 'ac-b-dev', 'member'),
  ('conv-b-1', 'ac-b-qa',  'member');

-- ─── messages (3) ─────────────────────────────────────────────────────────────
-- sender_role values allowed: 'chief' | 'agent' | 'system' | 'tool'

INSERT INTO messages
  (id, conversation_id, sender_id, sender_role, content, created_at)
VALUES
  ('msg-b1-01', 'conv-b-1', 'ac-b-dev', 'agent', 'Isolamento confirmado: este é o project-b.',    '2026-04-14 09:10:00'),
  ('msg-b1-02', 'conv-b-1', 'ac-b-qa',  'agent', 'Roger. Dados do project-a não devem vazar.',    '2026-04-14 09:15:00'),
  ('msg-b1-03', 'conv-b-1', 'ac-b-dev', 'agent', 'Correto. Cada projeto tem seu próprio canvas.', '2026-04-14 09:20:00');

-- ============================================================
-- END of project-b-fixture
-- ============================================================
