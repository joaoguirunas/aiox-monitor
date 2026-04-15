import { test, expect } from '@playwright/test';

/**
 * visual-states.spec.ts — Regressão Visual dos Estados do AgentChatNode (JOB-033)
 *
 * Captura screenshots de cada estado e compara contra baseline:
 *   idle     → dot cinza  (#6b7280)
 *   thinking → dot amarelo com glow (#fbbf24)
 *   speaking → dot verde (#34d399)
 *   offline  → dot cinza-escuro (#374151)
 *
 * Nota: os estados "online" e "error" mencionados nos requisitos serão
 * mapeados em Wave 3 quando o backend (Han Solo JOB-021) estiver online.
 * "online" → speaking (agente ativo), "error" → novo status a implementar.
 *
 * Fixture: /command-room/spike-states (SpikeStatesCanvas.tsx)
 *
 * Primeira execução: npx playwright test visual-states --update-snapshots
 * Regenerar baselines: npx playwright test visual-states --update-snapshots
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Definição de cada estado a validar */
const AGENT_STATES = [
  {
    status: 'idle',
    agentName: 'Agent-Idle',
    expectedDotColor: '#6b7280',
    snapshotName: 'agent-state-idle.png',
  },
  {
    status: 'thinking',
    agentName: 'Agent-Thinking',
    expectedDotColor: '#fbbf24',
    snapshotName: 'agent-state-thinking.png',
  },
  {
    status: 'speaking',
    agentName: 'Agent-Speaking',
    expectedDotColor: '#34d399',
    snapshotName: 'agent-state-speaking.png',
  },
  {
    status: 'offline',
    agentName: 'Agent-Offline',
    expectedDotColor: '#374151',
    snapshotName: 'agent-state-offline.png',
  },
] as const;

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe('Visual States — AgentChatNode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/command-room/spike-states');

    // Aguarda o React Flow renderizar e o fitView estabilizar
    await page.locator('.react-flow__renderer').waitFor({ state: 'visible' });
    await page.waitForTimeout(600);
  });

  // ── Smoke: todos os 4 nodes renderizam ───────────────────────────────────

  test('renderiza os 4 nodes de estado na página fixture', async ({ page }) => {
    for (const { agentName } of AGENT_STATES) {
      await expect(
        page.locator('.react-flow__node').filter({ hasText: agentName }),
      ).toBeVisible();
    }

    await expect(page.locator('.react-flow__node-agentChatNode')).toHaveCount(4);
  });

  // ── Cada estado tem mensagem de saudação correta ──────────────────────────

  for (const { status, agentName } of AGENT_STATES) {
    test(`${status}: mensagem inicial menciona "${agentName}"`, async ({ page }) => {
      const node = page.locator('.react-flow__node').filter({ hasText: agentName });
      await expect(node.getByText(new RegExp(`Sou ${agentName}`))).toBeVisible();
    });
  }

  // ── Regressão visual por screenshot ──────────────────────────────────────

  for (const { status, agentName, snapshotName } of AGENT_STATES) {
    test(`${status}: screenshot do card corresponde ao baseline`, async ({ page }) => {
      const node = page.locator('.react-flow__node').filter({ hasText: agentName });
      await expect(node).toBeVisible();

      // Screenshot do node individual — compara contra baseline em __snapshots__/
      // Na primeira execução, cria o baseline. Em CI, compara.
      await expect(node).toHaveScreenshot(snapshotName);
    });
  }

  // ── Status dot: cor correta por estado ───────────────────────────────────

  for (const { status, agentName, expectedDotColor } of AGENT_STATES) {
    test(`${status}: status dot tem cor correta (${expectedDotColor})`, async ({ page }) => {
      const node = page.locator('.react-flow__node').filter({ hasText: agentName });

      // O dot é um div de 8x8px com background definido inline.
      // Localiza pelo tamanho e posição dentro do header do card.
      // Busca todos os divs com border-radius 50% dentro do header (avatar + dot).
      // O dot é o ÚLTIMO (depois do avatar e do nome).
      const dotColor = await node.evaluate((el) => {
        // Todos os divs com border-radius circular dentro do node
        const circles = Array.from(el.querySelectorAll<HTMLElement>('div')).filter((d) => {
          const s = d.style;
          return (
            s.borderRadius === '50%' &&
            parseInt(s.width || '0') <= 10 && // dot = 8px, avatar = 32px
            parseInt(s.height || '0') <= 10
          );
        });
        // O dot de status é o único círculo com dimensão <= 10px
        return circles[0]?.style.background ?? null;
      });

      expect(dotColor).not.toBeNull();
      // Normalizar para lowercase para comparação case-insensitive
      expect(dotColor!.toLowerCase()).toContain(expectedDotColor.toLowerCase().replace('#', ''));
    });
  }

  // ── Thinking: tem glow no dot ─────────────────────────────────────────────

  test('thinking: status dot tem box-shadow (glow)', async ({ page }) => {
    const node = page.locator('.react-flow__node').filter({ hasText: 'Agent-Thinking' });

    const hasShadow = await node.evaluate((el) => {
      const dots = Array.from(el.querySelectorAll<HTMLElement>('div')).filter((d) => {
        const s = d.style;
        return (
          s.borderRadius === '50%' &&
          parseInt(s.width || '0') <= 10
        );
      });
      return dots[0]?.style.boxShadow !== '';
    });

    expect(hasShadow).toBe(true);
  });

  // ── Screenshot full-page da fixture ──────────────────────────────────────

  test('screenshot completo da página fixture (todos os estados)', async ({ page }) => {
    await expect(page).toHaveScreenshot('all-agent-states.png', {
      fullPage: false,
    });
  });
});
