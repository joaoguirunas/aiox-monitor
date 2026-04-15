import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E — aiox-monitor
 *
 * WebServer: npm run dev (porta 8888)
 * Tests: tests/e2e/
 * Snapshots: tests/e2e/__snapshots__/
 *
 * Primeira execução cria os baselines de screenshot.
 * Para regenerar: npx playwright test --update-snapshots
 */
export default defineConfig({
  testDir: './tests/e2e',
  snapshotDir: './tests/e2e/__snapshots__',
  timeout: 30_000,
  expect: {
    timeout: 8_000,
    toHaveScreenshot: {
      /** 4% de diferença por pixel — tolera antialiasing entre plataformas */
      threshold: 0.04,
      /** Até 5% dos pixels podem diferir antes de falhar */
      maxDiffPixelRatio: 0.05,
      /** Desabilita animações CSS para screenshots estáveis */
      animations: 'disabled',
    },
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:8888',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 800 },
    /** Desabilita animações nas páginas durante os testes */
    reducedMotion: 'reduce',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8888',
    /** Reutiliza servidor existente em dev local; sobe novo em CI */
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
