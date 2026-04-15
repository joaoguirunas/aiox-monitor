/**
 * load-test-fixtures.ts — JOB-043
 *
 * Cria (ou recria) o banco de dados de teste e carrega todas as fixtures
 * do diretório src/server/db/seed/test-fixtures/*.sql em ordem alfabética.
 *
 * Fluxo:
 *   1. Deleta DB anterior (fresh start determinístico)
 *   2. Cria novo DB em TEST_DB_PATH
 *   3. Inicializa schema v1 (initSchema)
 *   4. Stub de command_room_terminals (necessário para FK da migration 002)
 *   5. Aplica migration 001 (tabelas v2)
 *   6. Aplica migration 002 (FK + triggers)
 *   7. Aplica cada fixture *.sql em ordem alfabética
 *
 * Variáveis de ambiente:
 *   TEST_DB_PATH  — Caminho do DB de teste (default: data/test.db)
 *   QUIET         — Suprime logs de progresso quando '1'
 *
 * Uso direto:
 *   npx tsx scripts/load-test-fixtures.ts
 *   TEST_DB_PATH=/tmp/e2e.db npx tsx scripts/load-test-fixtures.ts
 *
 * Uso como módulo (ex: reset-test-db.ts, Playwright globalSetup):
 *   import { loadTestFixtures } from './load-test-fixtures.ts';
 *   await loadTestFixtures();
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initSchema } from '../src/lib/schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const MIGRATIONS_DIR = path.join(ROOT, 'src', 'server', 'db', 'migrations');
const FIXTURES_DIR   = path.join(ROOT, 'src', 'server', 'db', 'seed', 'test-fixtures');

// ─── Core logic ──────────────────────────────────────────────────────────────

export interface LoadFixturesOptions {
  /** Absolute path to the test DB (default: env TEST_DB_PATH or data/test.db) */
  dbPath?: string;
  /** Suppress progress logs (default: false) */
  quiet?: boolean;
}

export function loadTestFixtures(opts: LoadFixturesOptions = {}): void {
  const dbPath = opts.dbPath
    ?? process.env['TEST_DB_PATH']
    ?? path.join(ROOT, 'data', 'test.db');
  const quiet = opts.quiet ?? (process.env['QUIET'] === '1');

  function log(msg: string) {
    if (!quiet) console.log(`[load-fixtures] ${msg}`);
  }

  function readSql(filePath: string): string {
    return fs.readFileSync(filePath, 'utf8');
  }

  log(`Target DB: ${dbPath}`);

  // 1. Fresh start — delete existing test DB
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    // SQLite WAL mode creates -wal and -shm sidecar files
    for (const ext of ['-wal', '-shm']) {
      const sidecar = dbPath + ext;
      if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
    }
    log('Deleted existing test DB and WAL sidecars.');
  }

  // Ensure parent directory exists
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  // 2. Create fresh DB
  const db = new DatabaseSync(dbPath);
  log('Created new DB.');

  // 3. Initialize v1 schema (projects, agents, terminals, sessions, events, etc.)
  initSchema(db);
  log('Initialized v1 schema.');

  // 4. Stub command_room_terminals — required by migration 002 FK
  //    (The v1 table is created by JOB-012; we stub it here for test isolation)
  db.exec(`
    CREATE TABLE IF NOT EXISTS command_room_terminals (
      id               TEXT PRIMARY KEY,
      agent_name       TEXT,
      project_path     TEXT,
      pty_status       TEXT DEFAULT 'idle',
      category_id      TEXT,
      is_chief         INTEGER DEFAULT 0,
      linked_terminal_ids TEXT
    );
  `);
  log('Stubbed command_room_terminals.');

  // 5. Apply migration 001 (v2 tables: agent_cards, connections, conversations, etc.)
  //    Uses CREATE TABLE IF NOT EXISTS — safe to run even if schema.ts already
  //    created these tables.
  const sql001 = readSql(path.join(MIGRATIONS_DIR, '001_sala_de_comando_v2.sql'));
  db.exec(sql001);
  log('Applied migration 001.');

  // 6. Apply migration 002 (FK agent_cards.pty_terminal_id + triggers)
  //    Rebuilds agent_cards with FK; CREATE TRIGGER IF NOT EXISTS is idempotent.
  const sql002 = readSql(path.join(MIGRATIONS_DIR, '002_pty_fk_and_triggers.sql'));
  db.exec(sql002);
  log('Applied migration 002.');

  // 7. Load fixture files in alphabetical order
  const fixtureFiles = fs
    .readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // alphabetical → project-a before project-b

  if (fixtureFiles.length === 0) {
    console.warn('[load-fixtures] WARNING: No *.sql fixture files found in', FIXTURES_DIR);
  } else {
    for (const file of fixtureFiles) {
      const filePath = path.join(FIXTURES_DIR, file);
      db.exec(readSql(filePath));
      log(`Loaded fixture: ${file}`);
    }
  }

  db.close();
  log(`Done. ${fixtureFiles.length} fixture(s) loaded into ${dbPath}`);
}

// ─── CLI entry point ──────────────────────────────────────────────────────────
// Runs only when invoked directly (not when imported as a module)

const isMain = process.argv[1] != null
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  loadTestFixtures();
}
