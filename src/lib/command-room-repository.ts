import { db } from '@/lib/db';

// node:sqlite returns Record<string, SQLOutputValue> — double-cast through unknown
type Row = Record<string, unknown>;

export interface TerminalCategory {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  color: string | null;
}

export interface CommandRoomTerminalRow {
  id: string;
  agent_name: string;
  agent_display_name: string | null;
  project_path: string;
  cols: number;
  rows: number;
  pty_status: 'active' | 'idle' | 'closed' | 'crashed';
  created_at: string;
  last_active: string;
  category_id: string | null;
  description: string | null;
  is_chief: number;
}

export function insertTerminal(
  id: string,
  agentName: string,
  agentDisplayName: string | null,
  projectPath: string,
  cols: number,
  rows: number,
  categoryId?: string | null,
  description?: string | null,
  isChief = false,
): void {
  // If setting as chief, clear any existing chief for this project
  if (isChief) {
    db.prepare(`
      UPDATE command_room_terminals
      SET is_chief = 0
      WHERE project_path = ? AND is_chief = 1
    `).run(projectPath);
  }

  db.prepare(`
    INSERT INTO command_room_terminals (id, agent_name, agent_display_name, project_path, cols, rows, category_id, description, is_chief)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, agentName, agentDisplayName, projectPath, cols, rows, categoryId ?? null, description ?? null, isChief ? 1 : 0);
}

export function updateTerminalStatus(
  id: string,
  status: 'closed' | 'crashed' | 'active' | 'idle',
): void {
  db.prepare(`
    UPDATE command_room_terminals
    SET pty_status = ?, last_active = datetime('now')
    WHERE id = ?
  `).run(status, id);
}

export function listActiveTerminals(): CommandRoomTerminalRow[] {
  const result = db.prepare(`
    SELECT id, agent_name, agent_display_name, project_path, cols, rows,
           pty_status, created_at, last_active, category_id, description, is_chief
    FROM command_room_terminals
    WHERE pty_status != 'closed'
    ORDER BY is_chief DESC, created_at ASC
  `).all() as Row[];
  return result as unknown as CommandRoomTerminalRow[];
}

export function updateTerminalDimensions(id: string, cols: number, rows: number): void {
  db.prepare(`
    UPDATE command_room_terminals
    SET cols = ?, rows = ?, last_active = datetime('now')
    WHERE id = ?
  `).run(cols, rows, id);
}

export function markCrashedTerminals(activeIds: string[]): void {
  if (activeIds.length === 0) {
    db.prepare(`
      UPDATE command_room_terminals
      SET pty_status = 'crashed'
      WHERE pty_status = 'active'
    `).run();
    return;
  }

  const placeholders = activeIds.map(() => '?').join(',');
  db.prepare(`
    UPDATE command_room_terminals
    SET pty_status = 'crashed'
    WHERE pty_status = 'active'
      AND id NOT IN (${placeholders})
  `).run(...activeIds);
}

export function updateTerminal(
  id: string,
  updates: {
    category_id?: string | null;
    description?: string | null;
    is_chief?: boolean;
  }
): void {
  const setClauses: string[] = [];
  const values: (string | number | null)[] = [];

  if (updates.category_id !== undefined) {
    setClauses.push('category_id = ?');
    values.push(updates.category_id);
  }

  if (updates.description !== undefined) {
    setClauses.push('description = ?');
    values.push(updates.description);
  }

  if (updates.is_chief !== undefined) {
    // If setting as chief, first clear existing chief for this terminal's project
    if (updates.is_chief) {
      db.prepare(`
        UPDATE command_room_terminals
        SET is_chief = 0
        WHERE project_path = (SELECT project_path FROM command_room_terminals WHERE id = ?)
          AND is_chief = 1
      `).run(id);
    }
    setClauses.push('is_chief = ?');
    values.push(updates.is_chief ? 1 : 0);
  }

  if (setClauses.length === 0) return;

  setClauses.push('last_active = datetime(\'now\')');
  values.push(id);

  db.prepare(`
    UPDATE command_room_terminals
    SET ${setClauses.join(', ')}
    WHERE id = ?
  `).run(...values);
}

// ─── Terminal Categories ──────────────────────────────────────────────────

export function createCategory(
  id: string,
  name: string,
  description?: string | null,
  color?: string | null,
  displayOrder?: number,
): void {
  db.prepare(`
    INSERT INTO terminal_categories (id, name, description, color, display_order)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name, description ?? null, color ?? null, displayOrder ?? 0);
}

export function listCategories(): TerminalCategory[] {
  const result = db.prepare(`
    SELECT id, name, description, display_order, color
    FROM terminal_categories
    ORDER BY display_order ASC, name ASC
  `).all() as Row[];
  return result as unknown as TerminalCategory[];
}

export function updateCategory(
  id: string,
  updates: {
    name?: string;
    description?: string | null;
    color?: string | null;
    display_order?: number;
  }
): void {
  const setClauses: string[] = [];
  const values: (string | number | null)[] = [];

  if (updates.name !== undefined) {
    setClauses.push('name = ?');
    values.push(updates.name);
  }

  if (updates.description !== undefined) {
    setClauses.push('description = ?');
    values.push(updates.description);
  }

  if (updates.color !== undefined) {
    setClauses.push('color = ?');
    values.push(updates.color);
  }

  if (updates.display_order !== undefined) {
    setClauses.push('display_order = ?');
    values.push(updates.display_order);
  }

  if (setClauses.length === 0) return;

  values.push(id);

  db.prepare(`
    UPDATE terminal_categories
    SET ${setClauses.join(', ')}
    WHERE id = ?
  `).run(...values);
}

export function deleteCategory(id: string): void {
  // Terminals with this category will have category_id set to NULL due to ON DELETE SET NULL
  db.prepare(`
    DELETE FROM terminal_categories
    WHERE id = ?
  `).run(id);
}
