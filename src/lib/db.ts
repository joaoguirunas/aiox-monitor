import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { initSchema } from './schema';

const DB_PATH = path.join(process.cwd(), 'data', 'monitor.db');

function createDb(): DatabaseSync {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const instance = new DatabaseSync(DB_PATH);
  initSchema(instance);
  return instance;
}

// Global singleton — survives Next.js hot-reload in development
declare global {
  // eslint-disable-next-line no-var
  var __aiox_db: DatabaseSync | undefined;
}

export const db: DatabaseSync =
  process.env.NODE_ENV === 'production'
    ? createDb()
    : (globalThis.__aiox_db ??= createDb());
