import { test, expect } from '@playwright/test';
import { waitForCanvas } from './fixtures/index';

/**
 * Journey 2 — Drag Chief→Luke, Aresta, `/ask @Luke oi`, Stream
 *
 * Stories cobertas: 9.2 (connections API), 9.3 (MessageDispatcher), 9.4 (WS protocol)
 *
 * Status por assertion:
 *   ✅ A-handles : handles de conexão React Flow renderizam nos AgentChatNodes
 *   ✅ A-nodrag  : arrastar pelo handle não move o card (behavior já verificado em spike.spec.ts;
 *                  aqui validamos que handles são distintos do drag handle do card)
 *   ⏭ A1-A10   : TODO JOB-035 — requerem connections API + MessageDispatcher + WS chat.chunk
 *
 * Pré-condição para testes completos:
 *   - J1 concluído (Chief no canvas)
 *   - Luke invocado no canvas
 *   - POST /api/connections implementado (Han Solo JOB-035)
 *
 * Fixtures: R2-D2 (JOB-043)
 */

const TODO_JOB_035 = 'TODO JOB-035: enable quando Han Solo subir — connections API + WS chat stream';

test.describe('J2 — Drag-to-Connect, /ask @Luke, Stream', () => {
  // ── Runnable — validações estruturais na spike page ────────────────────────

  test.describe('handles de conexão React Flow', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/command-room/spike');
      await waitForCanvas(page);
    });

    test('A-handles: cada AgentChatNode tem handle source (direita) e target (esquerda)', async ({
      page,
    }) => {
      // React Flow renderiza handles com classes .react-flow__handle-left / right
      const sourceHandles = page.locator('.react-flow__handle-right');
      const targetHandles = page.locator('.react-flow__handle-left');

      // Spike tem 2 nodes → 2 handles de cada tipo
      await expect(sourceHandles).toHaveCount(2);
      await expect(targetHandles).toHaveCount(2);
    });

    test('A-handle-distinct: handle source é distinto do .chat-drag-handle', async ({
      page,
    }) => {
      const lukeNode = page
        .locator('.react-flow__node')
        .filter({ hasText: /Dev Alpha/ });

      // .chat-drag-handle no topo do card — NÃO é o handle de conexão
      const dragHandle = lukeNode.locator('.chat-drag-handle');
      await expect(dragHandle).toBeVisible();

      // Handle de conexão (source) fica na borda direita do card
      const sourceHandle = lukeNode.locator('.react-flow__handle-right');
      await expect(sourceHandle).toBeVisible();

      // São elementos distintos
      const dragBox = await dragHandle.boundingBox();
      const handleBox = await sourceHandle.boundingBox();
      expect(dragBox?.x).not.toBeCloseTo(handleBox?.x ?? 0, -1);
    });

    test('A-drag-nodrag: arrastar pelo header do card não cria aresta', async ({ page }) => {
      // Arrastar pelo header (nodrag) não deve disparar drag de connection
      const lukeNode = page
        .locator('.react-flow__node')
        .filter({ hasText: /Dev Alpha/ });
      const header = lukeNode.locator('.nodrag').first();

      const edgesBefore = await page.locator('.react-flow__edge').count();

      // Drag no header — deve ser noop para conexões
      await header.hover();
      await page.mouse.down();
      const yodaNode = page.locator('.react-flow__node').filter({ hasText: /Chief/ });
      const yodaBox = await yodaNode.boundingBox();
      await page.mouse.move(yodaBox!.x + 50, yodaBox!.y + 50, { steps: 15 });
      await page.mouse.up();
      await page.waitForTimeout(200);

      // Apenas a aresta original do spike (delegation) — sem nova aresta criada por drag no header
      const edgesAfter = await page.locator('.react-flow__edge').count();
      expect(edgesAfter).toEqual(edgesBefore);
    });
  });

  // ── Skipped — Han Solo JOB-035 ─────────────────────────────────────────────

  test('A1: hover sobre card Chief — handle de saída aparece na borda direita', async ({
    page,
  }) => {
    // Nota: handle já existe sempre no DOM (React Flow), mas visibilidade
    // pode ser controlada por CSS opacity. Quando Han Solo entregar UI polish,
    // verificar que opacity transiciona de 0→1 no hover.
    test.skip(true, `${TODO_JOB_035} + UI polish (opacity:0→1 no hover do handle)`);
  });

  test('A2: drag handle Chief→Luke → POST /api/connections retorna 201', async ({ page }) => {
    test.skip(true, `${TODO_JOB_035} — POST /api/connections não implementado`);
  });

  test('A3: WS connection.added recebido → aresta Bezier aparece entre Chief e Luke', async ({
    page,
  }) => {
    test.skip(true, `${TODO_JOB_035} — WS connection.added event`);
  });

  test('A4: aresta recém-criada no estado idle (dashed cinza)', async ({ page }) => {
    test.skip(true, `${TODO_JOB_035}`);
  });

  test('A5: enviar /ask @Luke oi → POST /api/conversations/{convId}/messages com addressed_to', async ({
    page,
  }) => {
    test.skip(true, `${TODO_JOB_035} — POST /api/conversations/*/messages não implementado`);
  });

  test('A6: WS agent.status { cardId: luke, status: thinking } recebido em ≤300ms', async ({
    page,
  }) => {
    test.skip(true, `${TODO_JOB_035} — WS agent.status event`);
  });

  test('A7: status dot do Luke muda para âmbar pulsante (thinking)', async ({ page }) => {
    test.skip(true, `${TODO_JOB_035}`);
  });

  test('A8: aresta Chief→Luke muda para estado data-flowing (partícula animada)', async ({
    page,
  }) => {
    test.skip(true, `${TODO_JOB_035}`);
  });

  test('A9: WS chat.chunk chega sequencialmente; bolha renderiza token-a-token', async ({
    page,
  }) => {
    test.skip(true, `${TODO_JOB_035} — chat.chunk stream via WS`);
  });

  test('A10: após stream: message.new recebido; Luke volta para idle; aresta para active→idle', async ({
    page,
  }) => {
    test.skip(true, `${TODO_JOB_035}`);
  });

  test('A-403: enviar /ask antes de aresta existir retorna 403 e UI oferece "Criar conexão"', async ({
    page,
  }) => {
    test.skip(
      true,
      `${TODO_JOB_035} — authorization check (connection required before /ask)`,
    );
  });

  test('A-duplicate-edge: segundo drag Chief→Luke não cria segunda aresta (UNIQUE constraint)', async ({
    page,
  }) => {
    test.skip(
      true,
      `${TODO_JOB_035} — UNIQUE(source_id, target_id, kind) no DB + toast "Conexão já existe"`,
    );
  });
});
