/**
 * reset-test-db.ts — JOB-043
 *
 * Limpa e re-seed completo do banco de dados de teste.
 * Equivalente a: delete DB → load-test-fixtures (fresh start).
 *
 * Útil para:
 *   · Antes de rodar os testes E2E localmente
 *   · Resetar estado após testes que modificam dados
 *   · CI/CD pipeline (Playwright globalSetup)
 *
 * Variáveis de ambiente:
 *   TEST_DB_PATH  — Caminho do DB de teste (default: data/test.db)
 *
 * Uso:
 *   npx tsx scripts/reset-test-db.ts
 *   TEST_DB_PATH=/tmp/e2e.db npx tsx scripts/reset-test-db.ts
 */

import { loadTestFixtures } from './load-test-fixtures';

console.log('[reset-test-db] Resetting test database...');
loadTestFixtures();
console.log('[reset-test-db] Done.');
