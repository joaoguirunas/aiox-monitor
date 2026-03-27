import { DatabaseSync } from 'node:sqlite';
import { initSchema } from '../../src/lib/schema';

export function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  initSchema(db);
  return db;
}
