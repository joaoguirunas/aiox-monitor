-- ============================================================
-- Test Fixture: project-a
-- Story: JOB-043 · Consumer: JOB-044 (Mace Windu / Rey journeys)
-- Project: /fake/project-a
--
-- Schema source: src/lib/schema.ts (authoritative after JOB-035)
--   canvas_layouts: no user_id (project_path, viewport, node_positions, updated_at)
--   messages: no user_id; sender_role IN ('chief','agent','system','tool')
--
-- Contents:
--   agent_catalog   → 9 agents across 3 squads (squad-x×5, squad-y×3, squad-z×1)
--   agent_groups    → 5 groups (2 custom + 3 auto)
--   agent_cards     → 4 invoked cards
--   canvas_layouts  → 1 persisted layout for project-a
--   connections     → 3 edges
--   conversations   → 2 (peer + group)
--   conv_participants → 5 rows
--   messages        → 20 (10 per conversation)
-- ============================================================

-- ─── agent_catalog ───────────────────────────────────────────────────────────
-- squad-x: 5 agents

INSERT INTO agent_catalog
  (project_path, skill_path, squad, agent_id, display_name, icon, role,
   description, definition_path, source, persona_tags, last_seen_at)
VALUES
  ('/fake/project-a', 'squads/squad-x/agents/dev',       'squad-x', 'dev',       'Dex the Builder',    '💻', 'Full Stack Developer',
   'Implementação de código e features',
   '/fake/project-a/.aiox-core/squads/squad-x/agents/dev.md',
   'project', '["builder","coder","pragmatic"]', '2026-04-14 10:00:00'),

  ('/fake/project-a', 'squads/squad-x/agents/qa',        'squad-x', 'qa',        'Quinn the Reviewer', '🔍', 'QA Engineer',
   'Testes e revisão de qualidade',
   '/fake/project-a/.aiox-core/squads/squad-x/agents/qa.md',
   'project', '["reviewer","quality","systematic"]', '2026-04-14 10:00:00'),

  ('/fake/project-a', 'squads/squad-x/agents/architect', 'squad-x', 'architect', 'Aria the Designer',  '🏛', 'Solutions Architect',
   'Arquitetura e decisões técnicas',
   '/fake/project-a/.aiox-core/squads/squad-x/agents/architect.md',
   'project', '["architect","systems","strategic"]', '2026-04-14 10:00:00'),

  ('/fake/project-a', 'squads/squad-x/agents/pm',        'squad-x', 'pm',        'Morgan the Planner', '📋', 'Product Manager',
   'Planejamento e requisitos de produto',
   '/fake/project-a/.aiox-core/squads/squad-x/agents/pm.md',
   'project', '["planner","product","analytical"]', '2026-04-14 10:00:00'),

  ('/fake/project-a', 'squads/squad-x/agents/ux',        'squad-x', 'ux',        'Uma the Designer',   '🎨', 'UX Designer',
   'Design de experiência e interfaces',
   '/fake/project-a/.aiox-core/squads/squad-x/agents/ux.md',
   'project', '["designer","empathetic","visual"]', '2026-04-14 10:00:00'),

-- squad-y: 3 agents

  ('/fake/project-a', 'squads/squad-y/agents/chief',  'squad-y', 'chief',  'Chief Orchestrator', '👑', 'Chief Agent',
   'Orquestração principal do squad',
   '/fake/project-a/.aiox-core/squads/squad-y/agents/chief.md',
   'project', '["chief","orchestrator","leader"]', '2026-04-14 10:00:00'),

  ('/fake/project-a', 'squads/squad-y/agents/sm',     'squad-y', 'sm',     'River the Scrum',    '🌊', 'Scrum Master',
   'Facilitação e remoção de impedimentos',
   '/fake/project-a/.aiox-core/squads/squad-y/agents/sm.md',
   'project', '["facilitator","agile","process"]', '2026-04-14 10:00:00'),

  ('/fake/project-a', 'squads/squad-y/agents/po',     'squad-y', 'po',     'Pax the Owner',      '🎯', 'Product Owner',
   'Priorização e validação de stories',
   '/fake/project-a/.aiox-core/squads/squad-y/agents/po.md',
   'project', '["owner","backlog","validator"]', '2026-04-14 10:00:00'),

-- squad-z: 1 agent

  ('/fake/project-a', 'squads/squad-z/agents/devops', 'squad-z', 'devops', 'Gage the Ops',       '⚙️', 'DevOps Engineer',
   'CI/CD, git push e releases',
   '/fake/project-a/.aiox-core/squads/squad-z/agents/devops.md',
   'project', '["devops","infrastructure","exclusive"]', '2026-04-14 10:00:00');

-- ─── agent_groups ─────────────────────────────────────────────────────────────
-- 2 custom groups (source='project') + 3 auto-groups (source='auto')

INSERT INTO agent_groups
  (project_path, group_id, name, description, squad, member_skill_paths,
   topology, source, definition_path, last_seen_at)
VALUES
  -- Custom group 1: Full Stack Squad (squad-x core)
  ('/fake/project-a', 'grp-a-custom-1', 'Full Stack Squad', 'Core development trio',
   'squad-x',
   '["squads/squad-x/agents/dev","squads/squad-x/agents/qa","squads/squad-x/agents/architect"]',
   'chief-hub', 'project',
   '/fake/project-a/.aiox-core/squads/squad-x/groups/full-stack.md',
   '2026-04-14 10:00:00'),

  -- Custom group 2: Product Squad (cross-squad)
  ('/fake/project-a', 'grp-a-custom-2', 'Product Squad', 'Product ownership and planning',
   'squad-y',
   '["squads/squad-y/agents/chief","squads/squad-y/agents/po","squads/squad-x/agents/pm"]',
   'mesh', 'project',
   '/fake/project-a/.aiox-core/squads/squad-y/groups/product.md',
   '2026-04-14 10:00:00'),

  -- Auto-group 1: squad-x complete (chief-hub topology)
  ('/fake/project-a', 'grp-a-auto-1', 'squad-x (auto)', 'All agents in squad-x',
   'squad-x',
   '["squads/squad-x/agents/dev","squads/squad-x/agents/qa","squads/squad-x/agents/architect","squads/squad-x/agents/pm","squads/squad-x/agents/ux"]',
   'chief-hub', 'auto', NULL,
   '2026-04-14 10:00:00'),

  -- Auto-group 2: squad-y complete (pipeline topology)
  ('/fake/project-a', 'grp-a-auto-2', 'squad-y (auto)', 'All agents in squad-y',
   'squad-y',
   '["squads/squad-y/agents/chief","squads/squad-y/agents/sm","squads/squad-y/agents/po"]',
   'pipeline', 'auto', NULL,
   '2026-04-14 10:00:00'),

  -- Auto-group 3: squad-z complete (none topology — single agent)
  ('/fake/project-a', 'grp-a-auto-3', 'squad-z (auto)', 'All agents in squad-z',
   'squad-z',
   '["squads/squad-z/agents/devops"]',
   'none', 'auto', NULL,
   '2026-04-14 10:00:00');

-- ─── agent_cards (4 invoked cards) ───────────────────────────────────────────

INSERT INTO agent_cards
  (id, kind, display_name, aiox_agent, project_path, pty_terminal_id,
   category_id, is_chief, status, system_prompt, model, user_id,
   created_at, last_active, maestri_terminal_name, skill_path)
VALUES
  ('ac-a-chief', 'hybrid', 'Chief', 'chief',
   '/fake/project-a', NULL, 'cat-orchestrators', 1, 'idle',
   'You are the Chief orchestrator for project-a.',
   'claude-sonnet-4-6', 'local',
   '2026-04-14 09:00:00', '2026-04-14 10:30:00',
   'chief-terminal', 'squads/squad-y/agents/chief'),

  ('ac-a-dev', 'terminal', 'Dex', 'dev',
   '/fake/project-a', NULL, 'cat-builders', 0, 'thinking',
   'You are the Dev agent for project-a.',
   'claude-sonnet-4-6', 'local',
   '2026-04-14 09:05:00', '2026-04-14 10:28:00',
   'dev-terminal', 'squads/squad-x/agents/dev'),

  ('ac-a-qa', 'chat', 'Quinn', 'qa',
   '/fake/project-a', NULL, 'cat-quality', 0, 'speaking',
   'You are the QA agent for project-a.',
   'claude-sonnet-4-6', 'local',
   '2026-04-14 09:10:00', '2026-04-14 10:25:00',
   'qa-terminal', 'squads/squad-x/agents/qa'),

  ('ac-a-architect', 'chat', 'Aria', 'architect',
   '/fake/project-a', NULL, 'cat-design', 0, 'idle',
   'You are the Architect agent for project-a.',
   'claude-sonnet-4-6', 'local',
   '2026-04-14 09:15:00', '2026-04-14 10:00:00',
   'architect-terminal', 'squads/squad-x/agents/architect');

-- ─── canvas_layouts ───────────────────────────────────────────────────────────
-- Note: schema.ts defines canvas_layouts without user_id
-- (project_path, viewport, node_positions, updated_at)

INSERT INTO canvas_layouts
  (project_path, viewport, node_positions, updated_at)
VALUES
  ('/fake/project-a',
   '{"x":0,"y":0,"zoom":0.85}',
   '{"ac-a-chief":{"x":400,"y":200},"ac-a-dev":{"x":150,"y":400},"ac-a-qa":{"x":650,"y":400},"ac-a-architect":{"x":400,"y":600}}',
   '2026-04-14 10:30:00');

-- ─── connections (3 edges) ────────────────────────────────────────────────────

INSERT INTO connections
  (id, source_id, target_id, directed, kind, label, metadata, user_id, created_at)
VALUES
  ('conn-a-1', 'ac-a-chief', 'ac-a-dev',  1, 'chat',         'delegates',  NULL, 'local', '2026-04-14 09:20:00'),
  ('conn-a-2', 'ac-a-chief', 'ac-a-qa',   1, 'supervise',     'reviews',    NULL, 'local', '2026-04-14 09:20:00'),
  ('conn-a-3', 'ac-a-dev',   'ac-a-qa',   1, 'context-share', 'shares ctx', NULL, 'local', '2026-04-14 09:20:00');

-- ─── conversations (2) ────────────────────────────────────────────────────────

INSERT INTO conversations
  (id, kind, title, user_id, created_at, last_message_at)
VALUES
  ('conv-a-1', 'peer',  'Chief ↔ Dev thread',        'local', '2026-04-14 09:30:00', '2026-04-14 09:34:30'),
  ('conv-a-2', 'group', 'Chief + Dev + QA war room', 'local', '2026-04-14 09:31:00', '2026-04-14 09:35:30');

-- ─── conversation_participants ────────────────────────────────────────────────

INSERT INTO conversation_participants (conversation_id, agent_card_id, role)
VALUES
  ('conv-a-1', 'ac-a-chief', 'owner'),
  ('conv-a-1', 'ac-a-dev',   'member'),
  ('conv-a-2', 'ac-a-chief', 'owner'),
  ('conv-a-2', 'ac-a-dev',   'member'),
  ('conv-a-2', 'ac-a-qa',    'member');

-- ─── messages: conv-a-1 (10 messages — Chief ↔ Dev) ──────────────────────────
-- sender_role values allowed: 'chief' | 'agent' | 'system' | 'tool'
-- (schema.ts CHECK constraint — no 'user' role)

INSERT INTO messages
  (id, conversation_id, sender_id, sender_role, content, created_at)
VALUES
  ('msg-a1-01', 'conv-a-1', 'ac-a-chief', 'chief', 'Dex, preciso da feature de autenticação JWT até amanhã.',     '2026-04-14 09:30:00'),
  ('msg-a1-02', 'conv-a-1', 'ac-a-dev',   'agent', 'Entendido. Vou começar pelo middleware de validação.',        '2026-04-14 09:30:30'),
  ('msg-a1-03', 'conv-a-1', 'ac-a-chief', 'chief', 'Certifique-se de usar RS256, não HS256.',                     '2026-04-14 09:31:00'),
  ('msg-a1-04', 'conv-a-1', 'ac-a-dev',   'agent', 'RS256 anotado. Vou buscar a lib jose para Node 22.',          '2026-04-14 09:31:30'),
  ('msg-a1-05', 'conv-a-1', 'ac-a-chief', 'chief', 'Também precisamos de refresh token com rotação.',             '2026-04-14 09:32:00'),
  ('msg-a1-06', 'conv-a-1', 'ac-a-dev',   'agent', 'Implementarei refresh token store em Redis.',                 '2026-04-14 09:32:30'),
  ('msg-a1-07', 'conv-a-1', 'ac-a-chief', 'chief', 'Redis ok. Expiry: 15min access, 7d refresh.',                '2026-04-14 09:33:00'),
  ('msg-a1-08', 'conv-a-1', 'ac-a-dev',   'agent', 'Perfeito. Criar story ou posso ir direto?',                   '2026-04-14 09:33:30'),
  ('msg-a1-09', 'conv-a-1', 'ac-a-chief', 'chief', 'Criar story com @sm primeiro. Não pule o processo.',          '2026-04-14 09:34:00'),
  ('msg-a1-10', 'conv-a-1', 'ac-a-dev',   'agent', 'Certo. Notificando River agora.',                             '2026-04-14 09:34:30');

-- ─── messages: conv-a-2 (10 messages — Chief + Dev + QA) ─────────────────────

INSERT INTO messages
  (id, conversation_id, sender_id, sender_role, content, created_at)
VALUES
  ('msg-a2-01', 'conv-a-2', 'ac-a-chief', 'chief', 'War room: revisão da story 9.2 antes de fechar.',              '2026-04-14 09:31:00'),
  ('msg-a2-02', 'conv-a-2', 'ac-a-dev',   'agent', 'Implementei os endpoints. Cobertura de testes em 82%.',        '2026-04-14 09:31:30'),
  ('msg-a2-03', 'conv-a-2', 'ac-a-qa',    'agent', 'Revisei. 2 issues: SQL injection no endpoint de busca e falta de rate limit.', '2026-04-14 09:32:00'),
  ('msg-a2-04', 'conv-a-2', 'ac-a-dev',   'agent', 'SQL injection: usarei prepared statements. Rate limit: express-rate-limit.', '2026-04-14 09:32:30'),
  ('msg-a2-05', 'conv-a-2', 'ac-a-qa',    'agent', 'Prepared statements ok. Rate limit: 100 req/min por IP.',      '2026-04-14 09:33:00'),
  ('msg-a2-06', 'conv-a-2', 'ac-a-chief', 'chief', 'Dex, corrija e suba para re-review com Quinn.',                '2026-04-14 09:33:30'),
  ('msg-a2-07', 'conv-a-2', 'ac-a-dev',   'agent', 'Correções aplicadas. Rodando testes...',                       '2026-04-14 09:34:00'),
  ('msg-a2-08', 'conv-a-2', 'ac-a-dev',   'agent', 'Testes passando. 89% de cobertura agora.',                     '2026-04-14 09:34:30'),
  ('msg-a2-09', 'conv-a-2', 'ac-a-qa',    'agent', 'Re-review: aprovado. Story pode ir para Ready for Review.',    '2026-04-14 09:35:00'),
  ('msg-a2-10', 'conv-a-2', 'ac-a-chief', 'chief', 'Excelente. Gage, pode criar o PR agora.',                      '2026-04-14 09:35:30');

-- ============================================================
-- END of project-a-fixture
-- ============================================================
