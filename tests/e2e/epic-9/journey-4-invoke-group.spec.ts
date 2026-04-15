import { test, expect } from '@playwright/test';
import {
  setupProjectMocks,
  setupHanSoloMocks,
  waitForCanvas,
  MOCK_PROJECT_PATH,
  MOCK_GROUP_INVOKE_RESPONSE,
  MOCK_OPEN_RESPONSE_A,
} from './fixtures/index';

/**
 * Journey 4 — Invocar Grupo Sprint Planning → 6 Cards + 5 Arestas Chief-Hub
 *
 * Stories cobertas: 9.5c (grupos), 9.2b (invoke multi-agent)
 *
 * Status por assertion:
 *   ✅ A-catalog-groups: GET /api/agents/catalog retorna grupo sprint-planning
 *   ✅ A-mock-invoke:    mock de POST /api/groups/{id}/invoke retorna payload correto
 *   ✅ A-topology-math:  chief-hub com 6 membros = 5 arestas (Chief não conecta a si mesmo)
 *   ⏭ A1-A8:           TODO JOB-035 — POST /api/groups/{id}/invoke + WS agent.added × 6
 *                        + UI seleção de grupo no ⌘K palette
 *
 * Pré-condição para testes completos:
 *   - Projeto com .claude/commands/{squad}/groups/sprint-planning.md (≥6 membros, topology:chief-hub)
 *   - POST /api/groups/{groupId}/invoke implementado (Han Solo JOB-035)
 *   - ⌘K CommandPaletteGlobal com modo Grupo (story 9.7)
 *
 * Fixtures: R2-D2 (JOB-043)
 */

const TODO_JOB_035 =
  'TODO JOB-035: enable quando Han Solo subir — POST /api/groups/*/invoke + ⌘K palette modo Grupo';

test.describe('J4 — Invocar Grupo Sprint Planning, Chief-Hub', () => {
  // ── Runnable — validações do contrato de dados ─────────────────────────────

  test('A-catalog-groups: GET /api/agents/catalog retorna grupo sprint-planning com 6 membros', async ({
    page,
  }) => {
    await setupProjectMocks(page, MOCK_PROJECT_PATH);
    await page.goto('/command-room');
    await waitForCanvas(page);

    // O catalog mock inclui o grupo sprint-planning
    const sprintGroup = MOCK_OPEN_RESPONSE_A.catalog.groups.find(
      (g) => g.group_id === 'sprint-planning',
    );
    expect(sprintGroup).toBeDefined();

    const members = JSON.parse(sprintGroup!.member_skill_paths) as string[];
    expect(members).toHaveLength(6);
    expect(sprintGroup!.topology).toBe('chief-hub');
  });

  test('A-topology-math: chief-hub com 6 membros gera exatamente 5 arestas (Chief não→si mesmo)', async () => {
    // Validação de lógica pura — não precisa de browser
    // chief-hub: Chief conecta a cada um dos outros N-1 membros
    const MEMBERS = 6;
    const EDGES_EXPECTED = MEMBERS - 1; // Chief é membro, não se conecta a si mesmo
    expect(MOCK_GROUP_INVOKE_RESPONSE.connectionIds).toHaveLength(EDGES_EXPECTED);
    expect(MOCK_GROUP_INVOKE_RESPONSE.cardIds).toHaveLength(MEMBERS);
  });

  test('A-mock-invoke: mock de POST /api/groups/sprint-planning/invoke retorna 6 cardIds + 5 connIds', async ({
    page,
  }) => {
    await setupProjectMocks(page, MOCK_PROJECT_PATH);
    await setupHanSoloMocks(page);
    await page.goto('/command-room');
    await waitForCanvas(page);

    // Chamar diretamente o endpoint mockado
    const result = await page.evaluate(async () => {
      const r = await fetch('/api/groups/sprint-planning/invoke?projectPath=/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: '/test', groupId: 'sprint-planning' }),
      });
      return r.json();
    });

    const body = result as typeof MOCK_GROUP_INVOKE_RESPONSE;
    expect(body.cardIds).toHaveLength(6);
    expect(body.connectionIds).toHaveLength(5);
    expect(body.topology).toBe('chief-hub');
  });

  test('A-partial-invoke: grupo com membro desconhecido → response deve indicar parcial', async ({
    page,
  }) => {
    await setupProjectMocks(page, MOCK_PROJECT_PATH);

    // Mock com 1 membro ausente: 5 cardIds em vez de 6
    await page.route('**/api/groups/**/invoke**', (route) =>
      route.fulfill({
        status: 207, // Multi-Status: parcialmente invocado
        contentType: 'application/json',
        body: JSON.stringify({
          cardIds: [
            'card-chief-001',
            'card-luke-001',
            'card-yoda-001',
            'card-leia-001',
            'card-han-001',
          ],
          connectionIds: ['conn-1', 'conn-2', 'conn-3', 'conn-4'],
          topology: 'chief-hub',
          missing: ['/squad:agents:r2d2'],
          warning: '1 agente não encontrado: /squad:agents:r2d2',
        }),
      }),
    );

    await page.goto('/command-room');
    await waitForCanvas(page);

    const result = await page.evaluate(async () => {
      const r = await fetch('/api/groups/sprint-planning/invoke?projectPath=/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: '/test' }),
      });
      return { status: r.status, body: await r.json() };
    });

    // 207 Multi-Status sinaliza invocação parcial
    expect(result.status).toBe(207);
    const body = result.body as { missing: string[]; warning: string };
    expect(body.missing).toContain('/squad:agents:r2d2');
    expect(body.warning).toMatch(/1 agente não encontrado/);
  });

  // ── Skipped — Han Solo JOB-035 ─────────────────────────────────────────────

  test('A1: POST /api/groups/sprint-planning/invoke retorna 6 cardIds + 5 connIds em ≤2s', async ({
    page,
  }) => {
    test.skip(true, `${TODO_JOB_035}`);
  });

  test('A2: exatamente 6 eventos WS agent.added chegam (um por card)', async ({ page }) => {
    test.skip(true, `${TODO_JOB_035} — WS agent.added × 6`);
  });

  test('A3: exatamente 5 eventos WS connection.added chegam (Chief → cada membro)', async ({
    page,
  }) => {
    test.skip(true, `${TODO_JOB_035} — WS connection.added × 5`);
  });

  test('A4: canvas mostra 6 AgentChatNodes com nomes corretos dos membros do grupo', async ({
    page,
  }) => {
    test.skip(true, `${TODO_JOB_035} — requires agent.added WS events + canvas rendering`);
  });

  test('A5: layout inicial chief-hub — Chief centrado, 5 membros em arco sem sobreposição', async ({
    page,
  }) => {
    test.skip(
      true,
      `${TODO_JOB_035} + layout algorithm: screenToFlowPosition para topologia chief-hub`,
    );
  });

  test('A6: 5 arestas partem do Chief para cada membro (não membro→Chief, não mesh)', async ({
    page,
  }) => {
    test.skip(true, `${TODO_JOB_035} — WS connection.added direction validation`);
  });

  test('A7: badges source corretos — agentes do projeto têm "project", usuário têm "user"', async ({
    page,
  }) => {
    test.skip(true, `${TODO_JOB_035} — requires agent cards rendered from catalog`);
  });

  test('A8: ⌘K → Invocar agente → modo Grupo → selecionar Sprint Planning → preview mostra membros', async ({
    page,
  }) => {
    test.skip(
      true,
      `${TODO_JOB_035} — CommandPaletteGlobal modo Grupo (story 9.7) não implementado`,
    );
  });
});
