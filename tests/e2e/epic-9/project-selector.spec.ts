import { test, expect } from '@playwright/test';

/**
 * project-selector.spec.ts — CommandRoomProjectSelector (JOB-022, JOB-033)
 *
 * Valida o dropdown de seleção de projeto em /command-room:
 *   ✓ Botão trigger renderiza
 *   ✓ Dropdown abre ao clicar no trigger
 *   ✓ Lista MRU renderiza projetos mockados
 *   ✓ Input de busca filtra projetos
 *   ✓ Botão "Abrir pasta…" está presente
 *   ✓ Clicar em "Abrir pasta…" exibe input de path manual
 *   ✓ Selecionar projeto dispara POST /api/projects/open
 *   ✓ Clicar fora do dropdown fecha-o
 *
 * APIs mockadas para independência de backend (Han Solo JOB-021 em andamento):
 *   GET /api/projects/recent → 2 projetos MRU
 *   GET /api/projects        → lista legada vazia
 *   POST /api/projects/open  → { ok: true }
 */

// ─── Dados de fixture ─────────────────────────────────────────────────────────

const MOCK_RECENT = {
  projects: [
    {
      path: '/Users/test/projeto-alpha',
      name: 'projeto-alpha',
      openedAt: '2026-04-10T10:00:00Z',
    },
    {
      path: '/Users/test/projeto-beta',
      name: 'projeto-beta',
      openedAt: '2026-04-09T08:00:00Z',
    },
  ],
};

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe('CommandRoomProjectSelector — JOB-022', () => {
  test.beforeEach(async ({ page }) => {
    // Mockar APIs antes de navegar para garantir que os mocks estejam
    // ativos quando o hook useCommandRoomProject fizer os fetches.
    await page.route('**/api/projects/recent', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_RECENT),
      });
    });

    await page.route('**/api/projects', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route('**/api/projects/open', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto('/command-room');
    // Aguarda React Flow inicializar (canvas presente na página)
    await page.locator('.react-flow__renderer').waitFor({ state: 'visible' });
    // Aguarda fetch do MRU completar
    await page.waitForTimeout(300);
  });

  // ── 1. Trigger renderiza ───────────────────────────────────────────────────

  test('botão trigger do seletor renderiza com texto "Abrir projeto…"', async ({
    page,
  }) => {
    // Nenhum projeto selecionado → texto padrão
    await expect(page.getByText('Abrir projeto…')).toBeVisible();
  });

  // ── 2. Dropdown abre ──────────────────────────────────────────────────────

  test('dropdown abre ao clicar no trigger', async ({ page }) => {
    await page.getByText('Abrir projeto…').click();

    // Dropdown com role listbox e aria-label correto
    const dropdown = page.getByRole('listbox', { name: 'Selecionar projeto' });
    await expect(dropdown).toBeVisible();

    // Input de busca está presente no dropdown
    await expect(page.getByPlaceholder('Buscar projeto…')).toBeVisible();
  });

  // ── 3. Lista MRU renderiza ────────────────────────────────────────────────

  test('lista MRU exibe projetos mockados com badge "recente"', async ({
    page,
  }) => {
    await page.getByText('Abrir projeto…').click();

    // Projetos mockados devem aparecer
    await expect(page.getByRole('option', { name: /projeto-alpha/ })).toBeVisible();
    await expect(page.getByRole('option', { name: /projeto-beta/ })).toBeVisible();

    // Badges "recente" devem estar visíveis
    const recentBadges = page.getByText('recente');
    await expect(recentBadges.first()).toBeVisible();
  });

  // ── 4. Busca filtra projetos ──────────────────────────────────────────────

  test('input de busca filtra a lista de projetos', async ({ page }) => {
    await page.getByText('Abrir projeto…').click();

    const searchInput = page.getByPlaceholder('Buscar projeto…');
    await searchInput.fill('alpha');

    // Apenas projeto-alpha deve aparecer
    await expect(page.getByRole('option', { name: /projeto-alpha/ })).toBeVisible();
    await expect(page.getByRole('option', { name: /projeto-beta/ })).not.toBeVisible();
  });

  // ── 5. Botão "Abrir pasta…" presente ─────────────────────────────────────

  test('botão "Abrir pasta…" está presente no dropdown', async ({ page }) => {
    await page.getByText('Abrir projeto…').click();
    await expect(page.getByText('Abrir pasta…')).toBeVisible();
  });

  // ── 6. Clicar "Abrir pasta…" exibe input de path manual ──────────────────

  test('clicar em "Abrir pasta…" mostra input de path manual', async ({
    page,
  }) => {
    await page.getByText('Abrir projeto…').click();
    await page.getByText('Abrir pasta…').click();

    // Input de path absoluto aparece com placeholder correto
    const pathInput = page.getByPlaceholder('/Users/me/projeto');
    await expect(pathInput).toBeVisible();
    await expect(pathInput).toBeFocused({ timeout: 2_000 });
  });

  // ── 7. Selecionar projeto dispara POST /api/projects/open ─────────────────

  test('selecionar projeto dispara POST /api/projects/open com path correto', async ({
    page,
  }) => {
    const openedPaths: string[] = [];

    page.on('request', (req) => {
      if (req.url().includes('/api/projects/open') && req.method() === 'POST') {
        try {
          const body = req.postDataJSON() as { projectPath?: string };
          if (body?.projectPath) openedPaths.push(body.projectPath);
        } catch {
          // ignore parse errors
        }
      }
    });

    await page.getByText('Abrir projeto…').click();
    await page.getByRole('option', { name: /projeto-alpha/ }).click();

    // Dropdown deve fechar após a seleção
    await expect(page.getByRole('listbox')).not.toBeVisible({ timeout: 3_000 });

    // POST foi disparado com o path correto
    expect(openedPaths).toContain('/Users/test/projeto-alpha');
  });

  // ── 8. Clicar fora fecha o dropdown ──────────────────────────────────────

  test('clicar fora do dropdown fecha-o', async ({ page }) => {
    await page.getByText('Abrir projeto…').click();
    await expect(page.getByRole('listbox', { name: 'Selecionar projeto' })).toBeVisible();

    // Clicar no centro do canvas (fora do dropdown)
    await page.mouse.click(900, 500);

    await expect(page.getByRole('listbox')).not.toBeVisible({ timeout: 3_000 });
  });
});
