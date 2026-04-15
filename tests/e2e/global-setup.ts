/**
 * Playwright Global Setup — JOB-050
 *
 * Executa antes do webServer e de qualquer teste.
 * Semeia o banco de dados de teste com fixtures determinísticas
 * de src/server/db/seed/test-fixtures/ (JOB-043).
 *
 * O webServer é iniciado com TEST_DB_PATH=data/test.db depois deste setup,
 * então o servidor Next.js já encontra o DB populado ao subir.
 *
 * Variável usada: TEST_DB_PATH (default: data/test.db)
 */

import { spawnSync } from 'node:child_process';

export default async function globalSetup(): Promise<void> {
  const testDbPath = process.env.TEST_DB_PATH ?? 'data/test.db';

  const result = spawnSync(
    'npx',
    ['tsx', 'scripts/load-test-fixtures.ts'],
    {
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        TEST_DB_PATH: testDbPath,
        QUIET: '1',
      },
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `[global-setup] Falha ao semear test DB (${testDbPath}). Exit code: ${result.status ?? 'null'}`,
    );
  }
}
