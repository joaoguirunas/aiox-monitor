/**
 * E2E Fixtures — Epic 9 · Sala de Comando v2 (JOB-044)
 *
 * Compatibilidade com R2-D2 (JOB-043):
 *   - TEST_DB_PATH env var → path do SQLite de teste (R2-D2 entregará o seed)
 *   - E2E_PROJECT_PATH   → diretório projeto de teste no filesystem
 *
 * Quando JOB-043 entregar:
 *   1. Adicionar suporte a TEST_DB_PATH em src/lib/db.ts
 *   2. Substituir mocks HTTP pelas rotas reais usando o DB semeado
 *   3. Manter apenas os mocks das rotas ainda não implementadas (JOB-035)
 *
 * Uso:
 *   import { setupCommonMocks, MOCK_PROJECT_PATH, MOCK_CATALOG_RESPONSE } from './fixtures';
 */

import * as path from 'path';
import * as os from 'os';
import type { Page } from '@playwright/test';

// ─── Paths ────────────────────────────────────────────────────────────────────

/** Path para o SQLite de teste — R2-D2 (JOB-043) vai popular isso. */
export const TEST_DB_PATH = process.env.TEST_DB_PATH
  ?? path.join(process.cwd(), 'tests', 'e2e', 'fixtures', 'test.db');

/** Diretório do projeto de teste E2E no filesystem local. */
export const MOCK_PROJECT_PATH = process.env.E2E_PROJECT_PATH
  ?? path.join(os.homedir(), 'work', 'projeto-teste-e2e');

export const MOCK_PROJECT_PATH_B = process.env.E2E_PROJECT_PATH_B
  ?? path.join(os.homedir(), 'work', 'projeto-teste-e2e-b');

// ─── Mock API responses ───────────────────────────────────────────────────────

/** Resposta de POST /api/projects/open para projeto A. */
export const MOCK_OPEN_RESPONSE_A = {
  success: true,
  projectPath: MOCK_PROJECT_PATH,
  catalog: {
    agents: [
      {
        skill_path: '/squad:agents:chief',
        agent_id: 'chief',
        display_name: 'Chief',
        squad: 'agents',
        icon: '🧘',
        role: 'Squad Orchestrator',
        source: 'project' as const,
        is_chief: true,
      },
      {
        skill_path: '/squad:agents:luke',
        agent_id: 'luke',
        display_name: 'Luke',
        squad: 'agents',
        icon: '💻',
        role: 'Dev Alpha',
        source: 'project' as const,
        is_chief: false,
      },
    ],
    groups: [
      {
        group_id: 'sprint-planning',
        name: 'Sprint Planning',
        squad: 'agents',
        topology: 'chief-hub' as const,
        member_skill_paths: JSON.stringify([
          '/squad:agents:chief',
          '/squad:agents:luke',
          '/squad:agents:yoda',
          '/squad:agents:leia',
          '/squad:agents:han',
          '/squad:agents:r2d2',
        ]),
        source: 'project' as const,
      },
    ],
    total: 2,
  },
};

/** Resposta de POST /api/projects/open para projeto B. */
export const MOCK_OPEN_RESPONSE_B = {
  success: true,
  projectPath: MOCK_PROJECT_PATH_B,
  catalog: {
    agents: [
      {
        skill_path: '/squad:agents:vader',
        agent_id: 'vader',
        display_name: 'Vader',
        squad: 'agents',
        icon: '🎭',
        role: 'Dark Lord',
        source: 'project' as const,
        is_chief: false,
      },
    ],
    groups: [],
    total: 1,
  },
};

/** Resposta de GET /api/agents/catalog para projeto A. */
export const MOCK_CATALOG_RESPONSE = {
  projectPath: MOCK_PROJECT_PATH,
  agents: MOCK_OPEN_RESPONSE_A.catalog.agents,
  groups: MOCK_OPEN_RESPONSE_A.catalog.groups,
  total: MOCK_OPEN_RESPONSE_A.catalog.total,
};

/** Lista MRU — resposta de GET /api/projects/recent. */
export const MOCK_RECENT_RESPONSE = {
  projects: [
    {
      path: MOCK_PROJECT_PATH,
      name: 'projeto-teste-e2e',
      openedAt: '2026-04-14T10:00:00Z',
    },
    {
      path: MOCK_PROJECT_PATH_B,
      name: 'projeto-teste-e2e-b',
      openedAt: '2026-04-13T08:00:00Z',
    },
  ],
};

/** Resposta de POST /api/agents/invoke para Chief. */
export const MOCK_INVOKE_RESPONSE = {
  id: 'card-chief-001',
  skill_path: '/squad:agents:chief',
  display_name: 'Chief',
  status: 'idle',
  is_chief: true,
};

/** Resposta de POST /api/connections. */
export const MOCK_CONNECTION_RESPONSE = {
  id: 'conn-001',
  source_id: 'card-chief-001',
  target_id: 'card-luke-001',
  kind: 'chat',
  created_at: new Date().toISOString(),
};

/** Resposta de POST /api/groups/{id}/invoke — 6 cards Sprint Planning. */
export const MOCK_GROUP_INVOKE_RESPONSE = {
  cardIds: [
    'card-chief-001',
    'card-luke-001',
    'card-yoda-001',
    'card-leia-001',
    'card-han-001',
    'card-r2d2-001',
  ],
  connectionIds: [
    'conn-chief-luke',
    'conn-chief-yoda',
    'conn-chief-leia',
    'conn-chief-han',
    'conn-chief-r2d2',
  ],
  topology: 'chief-hub',
};

/** Resposta de PATCH /api/canvas/layout. */
export const MOCK_LAYOUT_SAVE_RESPONSE = {
  success: true,
  scenario_name: 'meu-layout',
  updated_at: new Date().toISOString(),
};

// ─── WS Event payloads ────────────────────────────────────────────────────────

let _wsSeq = 0;
function wsSeq(): number { return ++_wsSeq; }
function wsNow(): string { return new Date().toISOString(); }

export const WS_EVENTS = {
  projectOpened: (projectPath: string) =>
    JSON.stringify({ type: 'project.opened', v: 1, seq: wsSeq(), at: wsNow(), projectPath }),

  projectClosed: (projectPath: string) =>
    JSON.stringify({ type: 'project.closed', v: 1, seq: wsSeq(), at: wsNow(), projectPath }),

  catalogReloaded: (projectPath: string) =>
    JSON.stringify({
      type: 'catalog.reloaded',
      projectPath,
      full: MOCK_CATALOG_RESPONSE.agents,
    }),

  agentAdded: (card: typeof MOCK_INVOKE_RESPONSE) =>
    JSON.stringify({ type: 'agent.added', card }),

  agentStatus: (cardId: string, status: string) =>
    JSON.stringify({ type: 'agent.status', cardId, status }),

  connectionAdded: (connection: typeof MOCK_CONNECTION_RESPONSE) =>
    JSON.stringify({ type: 'connection.added', connection }),

  chatChunk: (convId: string, chunk: string) =>
    JSON.stringify({ type: 'chat.chunk', convId, delta: chunk }),

  messageNew: (convId: string) =>
    JSON.stringify({ type: 'message.new', convId }),
};

// ─── Setup helpers ────────────────────────────────────────────────────────────

/**
 * setupCommonMocks — monta todos os interceptores HTTP comuns antes de navegar.
 * Rotas reais são passadas through; rotas não implementadas retornam mocks.
 */
export async function setupCommonMocks(page: Page): Promise<void> {
  // GET /api/projects/recent — rota existente, mock para isolamento
  await page.route('**/api/projects/recent', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_RECENT_RESPONSE),
    }),
  );

  // GET /api/projects — lista legada, vazia para isolamento
  await page.route('**/api/projects', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    }),
  );
}

/**
 * setupProjectMocks — interceptores específicos para abertura de projeto.
 * @param projectPath path usado nos mocks (A ou B)
 */
export async function setupProjectMocks(
  page: Page,
  projectPath: string,
  responseOverride?: object,
): Promise<void> {
  await setupCommonMocks(page);

  // POST /api/projects/open
  await page.route('**/api/projects/open', (route) => {
    const isB = projectPath === MOCK_PROJECT_PATH_B;
    const response = responseOverride ?? (isB ? MOCK_OPEN_RESPONSE_B : MOCK_OPEN_RESPONSE_A);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });

  // POST /api/projects/close
  await page.route('**/api/projects/close', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
  );

  // GET /api/agents/catalog
  await page.route('**/api/agents/catalog**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_CATALOG_RESPONSE),
    }),
  );
}

/**
 * setupHanSoloMocks — mocks para rotas JOB-035 (não implementadas ainda).
 * Remove test.skip() e usa esses mocks quando Han Solo JOB-035 subir.
 */
export async function setupHanSoloMocks(page: Page): Promise<void> {
  // POST /api/agents/invoke
  await page.route('**/api/agents/invoke', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_INVOKE_RESPONSE),
    }),
  );

  // POST /api/connections
  await page.route('**/api/connections', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_CONNECTION_RESPONSE),
    }),
  );

  // POST /api/groups/*/invoke
  await page.route('**/api/groups/**/invoke**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_GROUP_INVOKE_RESPONSE),
    }),
  );

  // PATCH /api/canvas/layout
  await page.route('**/api/canvas/layout', (route) => {
    if (route.request().method() === 'PATCH') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_LAYOUT_SAVE_RESPONSE),
      });
    }
    return route.continue();
  });

  // GET /api/canvas/layout
  await page.route('**/api/canvas/layout**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        scenario_name: 'meu-layout',
        viewport: { x: 0, y: 0, zoom: 1 },
        node_positions: {
          'card-chief-001': { x: 300, y: 200 },
          'card-luke-001': { x: 100, y: 100 },
        },
      }),
    }),
  );
}

/** Aguarda o React Flow terminar de renderizar após navegação. */
export async function waitForCanvas(page: Page, timeout = 450): Promise<void> {
  await page.locator('.react-flow__renderer').waitFor({ state: 'visible' });
  await page.waitForTimeout(timeout);
}
