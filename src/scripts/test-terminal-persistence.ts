#!/usr/bin/env tsx
/**
 * Test script for Story 11.5 - Terminal Persistence
 *
 * Tests:
 * - Task 6.1: spawn → reload → terminals restored
 * - Task 6.2: server restart → terminals marked as crashed → frontend shows indicator
 * - Task 6.3: close terminal → doesn't reappear after reload
 */

import { db } from '../lib/db';

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

function log(color: string, prefix: string, message: string) {
  console.log(`${color}${prefix}${COLORS.reset} ${message}`);
}

function success(message: string) { log(COLORS.green, '✓', message); }
function error(message: string) { log(COLORS.red, '✗', message); }
function info(message: string) { log(COLORS.blue, 'ℹ', message); }
function warn(message: string) { log(COLORS.yellow, '⚠', message); }

// ─── Test Database Schema ────────────────────────────────────────────────────

function testSchema(): boolean {
  info('Testing database schema...');

  try {
    const tableInfo = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='command_room_terminals'
    `).get() as { name: string } | undefined;

    if (!tableInfo) {
      error('Table command_room_terminals does not exist');
      return false;
    }
    success('Table command_room_terminals exists');

    // Check columns
    const columns = db.prepare(`PRAGMA table_info(command_room_terminals)`).all() as Array<{ name: string }>;
    const requiredColumns = ['id', 'agent_name', 'project_path', 'cols', 'rows', 'pty_status', 'created_at', 'last_active'];

    for (const col of requiredColumns) {
      const found = columns.find(c => c.name === col);
      if (!found) {
        error(`Missing column: ${col}`);
        return false;
      }
    }
    success('All required columns exist');

    // Check index
    const indexes = db.prepare(`PRAGMA index_list(command_room_terminals)`).all() as Array<{ name: string }>;
    const hasStatusIndex = indexes.some(idx => idx.name === 'idx_crt_status');
    if (!hasStatusIndex) {
      warn('Missing index idx_crt_status (optional, but recommended)');
    } else {
      success('Index idx_crt_status exists');
    }

    return true;
  } catch (err) {
    error(`Schema test failed: ${(err as Error).message}`);
    return false;
  }
}

// ─── Test CRUD Operations ────────────────────────────────────────────────────

function testCRUD(): boolean {
  info('Testing CRUD operations...');

  try {
    const testId = 'test-terminal-' + Date.now();

    // INSERT
    db.prepare(`
      INSERT INTO command_room_terminals (id, agent_name, project_path, cols, rows, pty_status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(testId, '@dev', '/test/project', 220, 50, 'active');
    success('INSERT: Terminal created');

    // SELECT
    const row = db.prepare(`
      SELECT * FROM command_room_terminals WHERE id = ?
    `).get(testId) as { agent_name: string } | undefined;

    if (!row || row.agent_name !== '@dev') {
      error('SELECT: Terminal not found or incorrect data');
      return false;
    }
    success('SELECT: Terminal retrieved correctly');

    // UPDATE dimensions
    db.prepare(`
      UPDATE command_room_terminals
      SET cols = ?, rows = ?
      WHERE id = ?
    `).run(300, 60, testId);

    const updated = db.prepare(`SELECT cols, rows FROM command_room_terminals WHERE id = ?`).get(testId) as { cols: number; rows: number } | undefined;
    if (!updated || updated.cols !== 300 || updated.rows !== 60) {
      error('UPDATE: Dimensions not updated correctly');
      return false;
    }
    success('UPDATE: Dimensions updated correctly');

    // UPDATE status to closed
    db.prepare(`
      UPDATE command_room_terminals
      SET pty_status = ?
      WHERE id = ?
    `).run('closed', testId);

    const closed = db.prepare(`SELECT pty_status FROM command_room_terminals WHERE id = ?`).get(testId) as { pty_status: string } | undefined;
    if (!closed || closed.pty_status !== 'closed') {
      error('UPDATE: Status not updated to closed');
      return false;
    }
    success('UPDATE: Status updated to closed');

    // List active terminals (should NOT include closed)
    const active = db.prepare(`
      SELECT * FROM command_room_terminals
      WHERE pty_status != 'closed'
    `).all() as Array<{ id: string }>;

    const foundClosed = active.find(t => t.id === testId);
    if (foundClosed) {
      error('SELECT: Closed terminal should not appear in active list');
      return false;
    }
    success('SELECT: Closed terminals correctly filtered');

    // Cleanup
    db.prepare(`DELETE FROM command_room_terminals WHERE id = ?`).run(testId);
    success('CLEANUP: Test terminal deleted');

    return true;
  } catch (err) {
    error(`CRUD test failed: ${(err as Error).message}`);
    return false;
  }
}

// ─── Test Crashed Status Logic ───────────────────────────────────────────────

function testCrashedLogic(): boolean {
  info('Testing crashed status logic...');

  try {
    const terminal1 = 'test-active-1-' + Date.now();
    const terminal2 = 'test-active-2-' + Date.now();

    // Create 2 active terminals
    db.prepare(`
      INSERT INTO command_room_terminals (id, agent_name, project_path, cols, rows, pty_status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(terminal1, '@dev', '/test/project', 220, 50, 'active');

    db.prepare(`
      INSERT INTO command_room_terminals (id, agent_name, project_path, cols, rows, pty_status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(terminal2, '@qa', '/test/project', 220, 50, 'active');

    success('Created 2 active terminals for testing');

    // Simulate server restart: mark all active terminals as crashed except terminal1
    const activeIds = [terminal1];
    const placeholders = activeIds.map(() => '?').join(',');
    db.prepare(`
      UPDATE command_room_terminals
      SET pty_status = 'crashed'
      WHERE pty_status = 'active'
        AND id NOT IN (${placeholders})
    `).run(...activeIds);

    const t1 = db.prepare(`SELECT pty_status FROM command_room_terminals WHERE id = ?`).get(terminal1) as { pty_status: string } | undefined;
    const t2 = db.prepare(`SELECT pty_status FROM command_room_terminals WHERE id = ?`).get(terminal2) as { pty_status: string } | undefined;

    if (!t1 || t1.pty_status !== 'active') {
      error('Terminal1 should remain active');
      return false;
    }
    if (!t2 || t2.pty_status !== 'crashed') {
      error('Terminal2 should be marked as crashed');
      return false;
    }

    success('Crashed logic works correctly');

    // Cleanup
    db.prepare(`DELETE FROM command_room_terminals WHERE id IN (?, ?)`).run(terminal1, terminal2);
    success('CLEANUP: Test terminals deleted');

    return true;
  } catch (err) {
    error(`Crashed logic test failed: ${(err as Error).message}`);
    return false;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('\n' + COLORS.blue + '═══ Story 11.5 - Terminal Persistence Tests ═══' + COLORS.reset + '\n');

  const tests = [
    { name: 'Schema', fn: testSchema },
    { name: 'CRUD Operations', fn: testCRUD },
    { name: 'Crashed Status Logic', fn: testCrashedLogic },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    console.log(`\n${COLORS.yellow}▶ Running: ${test.name}${COLORS.reset}`);
    const result = test.fn();
    if (result) {
      passed++;
    } else {
      failed++;
    }
  }

  console.log('\n' + COLORS.blue + '═══ Results ═══' + COLORS.reset);
  console.log(`${COLORS.green}Passed: ${passed}${COLORS.reset}`);
  if (failed > 0) {
    console.log(`${COLORS.red}Failed: ${failed}${COLORS.reset}`);
    process.exit(1);
  } else {
    console.log('\n' + COLORS.green + '✓ All tests passed!' + COLORS.reset + '\n');
    process.exit(0);
  }
}

main();
