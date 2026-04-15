import { test, expect, type Page } from '@playwright/test';

/**
 * spike.spec.ts — Spike 9.0 · AgentChatNode no React Flow (JOB-033)
 *
 * Valida a rota /command-room/spike:
 *   ✓ 2 cards de agente renderizam (Luke + Yoda)
 *   ✓ Aresta de delegação renderiza entre os cards
 *   ✓ Digitar no input gera reply mock
 *   ✓ Drag pelo handle move o node sem apagá-lo
 *   ✓ Scroll nas mensagens não dispara zoom no canvas (pitfall §6.1.5)
 *   ✓ Backspace/Delete não apaga node selecionado (pitfall §6.1.4)
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Aguarda o React Flow terminar de renderizar e aplicar fitView. */
async function waitForCanvas(page: Page) {
  await page.locator('.react-flow__renderer').waitFor({ state: 'visible' });
  // fitView aplica transform assíncrono; aguarda estabilização
  await page.waitForTimeout(450);
}

/** Retorna o scale atual do viewport do React Flow (ex: 0.75). */
async function getCanvasScale(page: Page): Promise<number> {
  return page.evaluate(() => {
    const vp = document.querySelector<HTMLElement>('.react-flow__viewport');
    if (!vp) return 1;
    const match = vp.style.transform.match(/scale\(([^)]+)\)/);
    return match ? parseFloat(match[1]) : 1;
  });
}

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe('Spike 9.0 — AgentChatNode no React Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/command-room/spike');
    await waitForCanvas(page);
  });

  // ── 1. Dois cards renderizam ───────────────────────────────────────────────

  test('renderiza 2 cards de agente (Luke e Yoda)', async ({ page }) => {
    // Nomes dos agentes
    await expect(page.getByText('Luke')).toBeVisible();
    await expect(page.getByText('Yoda')).toBeVisible();

    // Roles dos agentes
    await expect(page.getByText('Dev Alpha · Frontend')).toBeVisible();
    await expect(page.getByText('Chief · Squad Orchestrator')).toBeVisible();

    // Exatamente 2 nodes do tipo agentChatNode no canvas
    const nodes = page.locator('.react-flow__node-agentChatNode');
    await expect(nodes).toHaveCount(2);
  });

  // ── 2. Aresta de delegação renderiza ──────────────────────────────────────

  test('renderiza aresta animada de delegação entre Luke e Yoda', async ({ page }) => {
    // Label da aresta deve estar visível
    await expect(page.getByText('delegation')).toBeVisible();

    // Exatamente 1 edge no React Flow
    const edges = page.locator('.react-flow__edge');
    await expect(edges).toHaveCount(1);

    // Ao menos uma SVG path de edge deve existir no DOM
    // (edges animados podem gerar múltiplas paths: visual + interaction)
    const edgePathCount = await page.locator('.react-flow__edge-path').count();
    expect(edgePathCount).toBeGreaterThanOrEqual(1);
  });

  // ── 3. Chat: digitar no input gera reply mock ─────────────────────────────

  test('digitar no input de Luke e enviar gera reply mock', async ({ page }) => {
    const lukeNode = page
      .locator('.react-flow__node')
      .filter({ hasText: /Dev Alpha/ });

    const input = lukeNode.locator('input');

    // Clica no input para focar (evita que o clique ative pan do canvas)
    await input.click();
    await input.fill('teste e2e');
    await input.press('Enter');

    // Mensagem do usuário aparece
    await expect(lukeNode.getByText('teste e2e')).toBeVisible({ timeout: 5_000 });

    // Reply mock do agente aparece
    await expect(
      lukeNode.getByText('[mock spike] Recebi: "teste e2e"'),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('botão Send envia mensagem ao clicar', async ({ page }) => {
    const lukeNode = page
      .locator('.react-flow__node')
      .filter({ hasText: /Dev Alpha/ });

    const input = lukeNode.locator('input');
    await input.click();
    await input.fill('via botão');

    // Clica no botão Send (svg Send dentro do button)
    const sendBtn = lukeNode.locator('button');
    await sendBtn.click();

    await expect(
      lukeNode.getByText('[mock spike] Recebi: "via botão"'),
    ).toBeVisible({ timeout: 5_000 });
  });

  // ── 4. Drag não apaga node ─────────────────────────────────────────────────

  test('drag pelo .chat-drag-handle move Luke sem apagá-lo', async ({ page }) => {
    const lukeNode = page
      .locator('.react-flow__node')
      .filter({ hasText: /Dev Alpha/ });
    const dragHandle = lukeNode.locator('.chat-drag-handle');

    const boxBefore = await lukeNode.boundingBox();
    expect(boxBefore).not.toBeNull();

    // Arrastar 130px à direita, 50px abaixo
    await dragHandle.hover();
    await page.mouse.down();
    await page.mouse.move(
      boxBefore!.x + boxBefore!.width / 2 + 130,
      boxBefore!.y + boxBefore!.height / 2 + 50,
      { steps: 25 },
    );
    await page.mouse.up();
    await page.waitForTimeout(300);

    // Node não foi apagado após o drag
    await expect(page.getByText('Luke')).toBeVisible();
    await expect(page.getByText('Dev Alpha · Frontend')).toBeVisible();

    // Node moveu: bounding box deve diferir da posição inicial
    const boxAfter = await lukeNode.boundingBox();
    const deltaX = Math.abs((boxAfter?.x ?? 0) - boxBefore!.x);
    const deltaY = Math.abs((boxAfter?.y ?? 0) - boxBefore!.y);
    expect(deltaX + deltaY).toBeGreaterThan(10);
  });

  // ── 5. Backspace/Delete não apaga node selecionado ────────────────────────

  test('Backspace/Delete não apaga nodes (pitfall §6.1.4)', async ({ page }) => {
    const lukeNode = page
      .locator('.react-flow__node')
      .filter({ hasText: /Dev Alpha/ });

    // Clica no drag handle para "selecionar" o node no React Flow
    await lukeNode.locator('.chat-drag-handle').click();
    await page.waitForTimeout(100);

    // Pressiona Backspace e Delete
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Delete');
    await page.waitForTimeout(200);

    // Ambos os nodes ainda existem
    await expect(page.getByText('Luke')).toBeVisible();
    await expect(page.getByText('Yoda')).toBeVisible();

    // Contagem de nodes inalterada
    await expect(page.locator('.react-flow__node-agentChatNode')).toHaveCount(2);
  });

  // ── 6. Scroll nas mensagens não dá zoom no canvas ─────────────────────────

  test('scroll nas mensagens de Luke não altera zoom do canvas (pitfall §6.1.5)', async ({
    page,
  }) => {
    const lukeNode = page
      .locator('.react-flow__node')
      .filter({ hasText: /Dev Alpha/ });

    // Área de mensagens tem a classe .nowheel — impede propagação do wheel ao canvas
    const messagesArea = lukeNode.locator('.nowheel').first();

    const scaleBefore = await getCanvasScale(page);

    // Scroll forte para baixo e depois para cima
    await messagesArea.hover();
    await page.mouse.wheel(0, 400);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(200);

    const scaleAfter = await getCanvasScale(page);

    // Scale não deve ter mudado (tolerância de 0.001)
    expect(Math.abs(scaleAfter - scaleBefore)).toBeLessThan(0.001);
  });
});
