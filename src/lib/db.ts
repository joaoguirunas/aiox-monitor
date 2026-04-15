import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { initSchema } from './schema';

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'monitor.db');

/**
 * Resolves the effective SQLite database path.
 *
 * When `TEST_DB_PATH` env var is set, it overrides the default so that
 * E2E tests (Mace Windu / JOB-044) can point the server at an isolated,
 * pre-seeded fixture database created by `scripts/load-test-fixtures.ts`.
 *
 * Throws a descriptive error if `TEST_DB_PATH` is set but empty, preventing
 * silent fallback to a wrong location.
 *
 * Exported for unit testing — reads `process.env` at call time so tests can
 * manipulate the env var before calling.
 */
export function resolveDbPath(): string {
  const override = process.env['TEST_DB_PATH'];
  if (override !== undefined) {
    if (override.trim() === '') {
      throw new Error(
        '[db] TEST_DB_PATH is set but empty. ' +
          'Provide an absolute path (e.g. TEST_DB_PATH=/tmp/test.db) ' +
          'or unset the variable to use the default database.',
      );
    }
    return path.resolve(override);
  }
  return DEFAULT_DB_PATH;
}

/**
 * Opens (or creates) a DatabaseSync at `dbPath`, initialises the schema,
 * and returns the instance.
 *
 * Exported for integration testing — callers can pass any path without
 * touching the module-level singleton.
 */
export function openDbAt(dbPath: string): DatabaseSync {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const instance = new DatabaseSync(dbPath);
  initSchema(instance);
  return instance;
}

function createDb(): DatabaseSync {
  return openDbAt(resolveDbPath());
}

// Global singleton — survives Next.js hot-reload in development
declare global {
  var __aiox_db: DatabaseSync | undefined;
}

export const db: DatabaseSync =
  process.env.NODE_ENV === 'production'
    ? createDb()
    : (globalThis.__aiox_db ??= createDb());
