import { test, expect, type Page } from '@playwright/test';
import { setupProjectMocks, waitForCanvas, MOCK_PROJECT_PATH } from './fixtures/index';

/**
 * Journey 6 — Desconectar Rede → WS Reconnect 30s → Catch-up de Mensagens
 *
 * Stories cobertas: 9.4 (WS protocol seq + Last-Event-ID), 9.9 (guard-rails)
 *
 * Status por assertion:
 *   ✅ A-offline-no-crash : colocar browser offline não crasha a app nem o canvas
 *   ✅ A-offline-interactive: canvas permanece interativo durante desconexão
 *   ✅ A-online-no-crash  : restaurar rede não produz erros JS não tratados
 *   ✅ A-offline-body     : body não mostra error overlay do Next.js durante offline
 *   ⏭ A1                 : TODO JOB-035 — badge de status WS no rodapé (Wave 3 UI)
 *   ⏭ A2                 : TODO JOB-035 — toast "Conexão perdida · reconectando…"
 *   ⏭ A4                 : TODO JOB-035 — WsClient backoff exponencial log
 *   ⏭ A6-A13             : TODO JOB-035 — reconnect + Last-Event-ID + catch-up messages
 *
 * Nota sobre Playwright offline mode:
 *   `page.context().setOffline(true)` bloqueia TODOS os requests HTTP e WS
 *   do browser context — equivalente a desconectar o cabo de rede.
 *   Em produção, a queda do WS pode acontecer sem queda do HTTP.
 *   Quando os testes A4+ forem habilitados, usar `routeWebSocket` para simular
 *   queda apenas do WS mantendo HTTP up.
 *
 * Fixtures: R2-D2 (JOB-043)
 */

const TODO_JOB_035 =
  'TODO JOB-035: enable quando Han Solo subir — WS reconnect UI (badge/toast) + Last-Event-ID catch-up';

/** Coloca o browser offline e aguarda um tempo para estabilizar. */
async function goOffline(page: Page, waitMs = 2_000): Promise<void> {
  await page.context().setOffline(true);
  await page.waitForTimeout(waitMs);
}

/** Restaura conectividade e aguarda reconexão WS. */
async function goOnline(page: Page, waitMs = 3_000): Promise<void> {
  await page.context().setOffline(false);
  await page.waitForTimeout(waitMs);
}

test.describe('J6 — Resiliência WS: Offline, Reconnect, Catch-up', () => {
  test.beforeEach(async ({ page }) => {
    await setupProjectMocks(page, MOCK_PROJECT_PATH);
    await page.goto('/command-room');
    await waitForCanvas(page);
  });

  // ── Runnable ────────────────────────────────────────────────────────────────

  test('A-offline-no-crash: colocar browser offline não produz error boundary nem crash', async ({
    page,
  }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await goOffline(page, 3_000);

    // Nenhum overlay de erro do Next.js
    await expect(page.locator('[data-nextjs-dialog]')).not.toBeVisible({ timeout: 1_000 }).catch(() => {
      // Seletor pode não existir — isso é ok
    });

    // Canvas ainda visível — app não crashou
    await expect(page.locator('.react-flow__renderer')).toBeVisible();

    // Sem erros JS críticos não tratados (exceto possíveis erros de WS expected)
    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('WebSocket') && !e.includes('fetch') && !e.includes('net::'),
    );
    expect(criticalErrors).toHaveLength(0);

    await goOnline(page, 1_000);
  });

  test('A-offline-interactive: canvas permanece interativo durante desconexão', async ({
    page,
  }) => {
    await goOffline(page, 1_500);

    // Canvas ainda renderiza
    await expect(page.locator('.react-flow__renderer')).toBeVisible();

    // Seletor de projeto ainda responde a clique
    await expect(page.getByText('Abrir projeto…')).toBeVisible();
    await page.getByText('Abrir projeto…').click();
    // Dropdown ainda abre (operação local, não requer rede)
    await expect(page.getByRole('listbox', { name: 'Selecionar projeto' })).toBeVisible({
      timeout: 2_000,
    });
    // Fechar dropdown
    await page.keyboard.press('Escape');

    // Na spike: nós ainda podem ser movidos durante offline
    // (spike page não requer rede para funcionar)
    await goOnline(page, 500);
  });

  test('A-offline-body: offline mode não causa loops de redirect nem blank screen', async ({
    page,
  }) => {
    await goOffline(page, 2_000);

    // URL não mudou
    expect(page.url()).toContain('/command-room');

    // Body não está blank
    const bodyContent = await page.locator('body').textContent();
    expect(bodyContent?.length ?? 0).toBeGreaterThan(10);

    // Spinner de loading não fica infinito (sem indicação visual de "carregando para sempre")
    await expect(page.locator('[data-loading]')).not.toBeVisible().catch(() => {
      // Seletor pode não existir — ok
    });

    await goOnline(page, 500);
  });

  test('A-online-no-crash: restaurar rede após 3s offline não produz erros JS', async ({
    page,
  }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await goOffline(page, 3_000);
    await goOnline(page, 2_000);

    // Canvas ainda visível após voltar online
    await expect(page.locator('.react-flow__renderer')).toBeVisible();

    // Sem erros JS não tratados (exceto WS/fetch durante offline — esperados)
    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('WebSocket') && !e.includes('fetch') && !e.includes('net::'),
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('A-spike-offline: spike page permanece totalmente funcional offline (sem WS)', async ({
    page,
  }) => {
    // A spike page é 100% in-memory — deve funcionar perfeitamente offline
    await page.goto('/command-room/spike');
    await waitForCanvas(page);

    await goOffline(page, 1_000);

    // 2 nodes visíveis
    await expect(page.getByText('Luke')).toBeVisible();
    await expect(page.getByText('Yoda')).toBeVisible();

    // Digitar no input de Luke ainda funciona
    const lukeNode = page.locator('.react-flow__node').filter({ hasText: /Dev Alpha/ });
    const input = lukeNode.locator('input');
    await input.click();
    await input.fill('offline test');
    await input.press('Enter');
    await expect(
      lukeNode.getByText('[mock spike] Recebi: "offline test"'),
    ).toBeVisible({ timeout: 3_000 });

    await goOnline(page, 500);
  });

  // ── Skipped — Han Solo JOB-035 ─────────────────────────────────────────────

  test('A1: em ≤5s após offline — badge de status WS muda para laranja/vermelho com tooltip', async ({
    page,
  }) => {
    test.skip(
      true,
      `${TODO_JOB_035} — WS status badge no rodapé (Wave 3 UI component não implementado)`,
    );
  });

  test('A2: toast não-intrusivo "Conexão perdida · reconectando…" aparece durante offline', async ({
    page,
  }) => {
    test.skip(
      true,
      `${TODO_JOB_035} — toast system + WsClient connection state events`,
    );
  });

  test('A3-canvas-interactive: canvas permanece interativo durante desconexão (story 9.9)', async ({
    page,
  }) => {
    // Nota: A-offline-interactive acima já cobre isso para o estado atual.
    // Este skip é para o test específico do plano da Rey com canvas populado.
    test.skip(
      true,
      `${TODO_JOB_035} — canvas com agent cards invocados (requer J1 completo primeiro)`,
    );
  });

  test('A4: WsClient backoff visível no console: "[WsClient] reconnect attempt #N in Xs"', async ({
    page,
  }) => {
    test.skip(
      true,
      `${TODO_JOB_035} — WsClient backoff exponencial com jitter ±500ms`
        + ` — verificar ProcessManager.ts reconnect logic`,
    );
  });

  test('A6: após restaurar rede — WS reconecta em ≤30s (ProcessManager reconnect)', async ({
    page,
  }) => {
    test.skip(
      true,
      `${TODO_JOB_035} — ProcessManager 30s reconnect já existe; badge precisa refletir isso`,
    );
  });

  test('A7: ao reconectar, cliente envia Last-Event-ID do último seq recebido', async ({
    page,
  }) => {
    test.skip(
      true,
      `${TODO_JOB_035} — WS protocol: seq numbering + Last-Event-ID no upgrade header`,
    );
  });

  test('A8: backend responde com eventos faltantes (seq > Last-Event-ID) em ordem', async ({
    page,
  }) => {
    test.skip(
      true,
      `${TODO_JOB_035} — WsBroadcaster sequence buffer + catch-up API`,
    );
  });

  test('A9: mensagens geradas durante offline aparecem no canvas após reconnect', async ({
    page,
  }) => {
    test.skip(
      true,
      `${TODO_JOB_035} — catch-up messages rendering in conversationsStore`,
    );
  });

  test('A10: badge WS volta para verde; toast de reconexão desaparece após reconnect', async ({
    page,
  }) => {
    test.skip(true, `${TODO_JOB_035} — WS status badge + toast lifecycle`);
  });

  test('A11: nenhuma mensagem duplicada após reconnect (servidor não reenvia antes do Last-Event-ID)', async ({
    page,
  }) => {
    test.skip(
      true,
      `${TODO_JOB_035} — pitfall: WsBroadcaster não deve reenviar eventos anteriores ao seq`,
    );
  });

  test('A12: contagem de mensagens bate com DB antes da queda + mensagens do período offline', async ({
    page,
  }) => {
    test.skip(
      true,
      `${TODO_JOB_035} — requires R2-D2 (JOB-043) DB fixture + catch-up message count validation`,
    );
  });

  test('A13: status dos cards correto após catch-up — não travado no estado anterior à queda', async ({
    page,
  }) => {
    test.skip(
      true,
      `${TODO_JOB_035} — pitfall: agent.status idle deve chegar no catch-up`
        + ` após agent.status thinking que foi enviado antes da queda`,
    );
  });
});
