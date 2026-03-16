import { db } from './db';
import type {
  Project,
  Agent,
  AgentWithStats,
  Terminal,
  Session,
  Event,
  EventFilters,
  CompanyConfig,
  ThemeName,
  ProjectWithDetails,
  Stats,
} from './types';

// node:sqlite returns Record<string, SQLOutputValue> — double-cast through unknown
type Row = Record<string, unknown>;

function row<T>(value: Row | undefined): T {
  return value as unknown as T;
}

function rows<T>(value: Row[]): T[] {
  return value as unknown as T[];
}

// ─── Projects ────────────────────────────────────────────────────────────────

export function upsertProject(projectPath: string, name: string): Project {
  db.prepare(`
    INSERT INTO projects (name, path)
    VALUES (?, ?)
    ON CONFLICT(path) DO UPDATE SET
      name        = excluded.name,
      last_active = datetime('now')
  `).run(name, projectPath);

  return row<Project>(
    db.prepare(`SELECT * FROM projects WHERE path = ?`).get(projectPath) as Row,
  );
}

export function getProjects(): Project[] {
  return rows<Project>(
    db.prepare(`SELECT * FROM projects ORDER BY last_active DESC`).all() as Row[],
  );
}

export function getProjectById(id: number): Project | null {
  const r = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as Row | undefined;
  return r ? row<Project>(r) : null;
}

export function getProjectWithDetails(id: number): ProjectWithDetails | null {
  const project = getProjectById(id);
  if (!project) return null;
  const agents = getAgents({ projectId: id });
  const terminals = getTerminalsByProject(id);
  return { ...project, agents, terminals };
}

export function deleteProject(id: number): { deleted: boolean } {
  const result = db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
  return { deleted: (result as { changes: number }).changes > 0 };
}

export function clearProjectEvents(id: number): { events: number; sessions: number } {
  const events = db.prepare(`DELETE FROM events WHERE project_id = ?`).run(id);
  const sessions = db.prepare(`DELETE FROM sessions WHERE project_id = ?`).run(id);
  return {
    events: (events as { changes: number }).changes,
    sessions: (sessions as { changes: number }).changes,
  };
}

export function getProjectStats(id: number): { events: number; agents: number; sessions: number } {
  const ev = db.prepare(`SELECT COUNT(*) as count FROM events WHERE project_id = ?`).get(id) as { count: number };
  const ag = db.prepare(`SELECT COUNT(*) as count FROM agents WHERE project_id = ?`).get(id) as { count: number };
  const se = db.prepare(`SELECT COUNT(*) as count FROM sessions WHERE project_id = ?`).get(id) as { count: number };
  return { events: ev.count, agents: ag.count, sessions: se.count };
}

// ─── Agents ──────────────────────────────────────────────────────────────────

export function upsertAgent(
  projectId: number,
  name: string,
  displayName?: string,
): Agent {
  db.prepare(`
    INSERT INTO agents (project_id, name, display_name)
    VALUES (?, ?, ?)
    ON CONFLICT(project_id, name) DO UPDATE SET
      display_name = COALESCE(excluded.display_name, display_name),
      last_active  = datetime('now')
  `).run(projectId, name, displayName ?? null);

  return row<Agent>(
    db.prepare(`SELECT * FROM agents WHERE project_id = ? AND name = ?`).get(
      projectId,
      name,
    ) as Row,
  );
}

export function updateAgentStatus(
  projectId: number,
  name: string,
  status: Agent['status'],
  currentTool: string | null,
): void {
  db.prepare(`
    UPDATE agents
    SET status = ?, current_tool = ?, last_active = datetime('now')
    WHERE project_id = ? AND name = ?
  `).run(status, currentTool, projectId, name);
}

export function getAgents(filters?: { projectId?: number }): AgentWithStats[] {
  if (filters?.projectId !== undefined) {
    return rows<AgentWithStats>(
      db.prepare(`
        SELECT a.*,
               COUNT(CASE WHEN t.status = 'active' THEN 1 END) AS terminal_count
        FROM agents a
        LEFT JOIN terminals t ON t.project_id = a.project_id
        WHERE a.project_id = ?
        GROUP BY a.id
        ORDER BY a.last_active DESC
      `).all(filters.projectId) as Row[],
    );
  }
  return rows<AgentWithStats>(
    db.prepare(`
      SELECT a.*,
             COUNT(CASE WHEN t.status = 'active' THEN 1 END) AS terminal_count
      FROM agents a
      LEFT JOIN terminals t ON t.project_id = a.project_id
      GROUP BY a.id
      ORDER BY a.last_active DESC
    `).all() as Row[],
  );
}

// ─── Terminals ───────────────────────────────────────────────────────────────

export function upsertTerminal(
  projectId: number,
  pid: number,
  opts?: {
    sessionId?: string;
    agentName?: string;
    agentDisplayName?: string;
    currentTool?: string;
    currentInput?: string;
  },
): Terminal {
  const o = opts ?? {};
  db.prepare(`
    INSERT INTO terminals (project_id, pid, session_id, status, agent_name, agent_display_name, current_tool, current_input)
    VALUES (?, ?, ?, 'processing', ?, ?, ?, ?)
    ON CONFLICT(project_id, pid) DO UPDATE SET
      session_id         = COALESCE(excluded.session_id, session_id),
      status             = 'processing',
      agent_name         = COALESCE(excluded.agent_name, agent_name),
      agent_display_name = COALESCE(excluded.agent_display_name, agent_display_name),
      current_tool       = COALESCE(excluded.current_tool, current_tool),
      current_input      = COALESCE(excluded.current_input, current_input),
      last_active        = datetime('now')
  `).run(
    projectId,
    pid,
    o.sessionId ?? null,
    o.agentName ?? null,
    o.agentDisplayName ?? null,
    o.currentTool ?? null,
    o.currentInput ?? null,
  );

  return row<Terminal>(
    db.prepare(`SELECT * FROM terminals WHERE project_id = ? AND pid = ?`).get(
      projectId,
      pid,
    ) as Row,
  );
}

export function deactivateTerminal(projectId: number, pid: number): void {
  db.prepare(`
    UPDATE terminals
    SET status = 'inactive', last_active = datetime('now')
    WHERE project_id = ? AND pid = ?
  `).run(projectId, pid);
}

export function deactivateStaleTerminals(olderThanSeconds = 7200): void {
  db.prepare(`
    UPDATE terminals
    SET status = 'inactive'
    WHERE status IN ('processing', 'active')
      AND last_active < datetime('now', '-' || ? || ' seconds')
  `).run(olderThanSeconds);
}

export function markTerminalsActive(olderThanSeconds = 30): void {
  db.prepare(`
    UPDATE terminals
    SET status = 'active'
    WHERE status = 'processing'
      AND last_active < datetime('now', '-' || ? || ' seconds')
  `).run(olderThanSeconds);
}

export function getTerminalsByProject(projectId: number): Terminal[] {
  return rows<Terminal>(
    db.prepare(`
      SELECT * FROM terminals WHERE project_id = ? ORDER BY first_seen_at ASC
    `).all(projectId) as Row[],
  );
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export function createSession(
  projectId: number,
  agentId?: number,
  terminalId?: number,
): Session {
  const result = db.prepare(`
    INSERT INTO sessions (project_id, agent_id, terminal_id)
    VALUES (?, ?, ?)
  `).run(projectId, agentId ?? null, terminalId ?? null);

  return row<Session>(
    db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(
      Number(result.lastInsertRowid),
    ) as Row,
  );
}

export function closeSession(sessionId: number): void {
  db.prepare(`
    UPDATE sessions
    SET ended_at = datetime('now'), status = 'completed'
    WHERE id = ? AND status = 'active'
  `).run(sessionId);
}

// ─── Events ──────────────────────────────────────────────────────────────────

export function insertEvent(data: Omit<Event, 'id' | 'created_at'>): Event {
  const result = db.prepare(`
    INSERT INTO events
      (project_id, agent_id, session_id, terminal_id, type, tool,
       input_summary, output_summary, duration_ms, raw_payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.project_id,
    data.agent_id ?? null,
    data.session_id ?? null,
    data.terminal_id ?? null,
    data.type,
    data.tool ?? null,
    data.input_summary ?? null,
    data.output_summary ?? null,
    data.duration_ms ?? null,
    data.raw_payload ?? null,
  );

  if (data.session_id) {
    db.prepare(`
      UPDATE sessions SET event_count = event_count + 1 WHERE id = ?
    `).run(data.session_id);
  }

  return row<Event>(
    db.prepare(`SELECT * FROM events WHERE id = ?`).get(
      Number(result.lastInsertRowid),
    ) as Row,
  );
}

export function getEvents(filters: EventFilters = {}): {
  events: Event[];
  total: number;
  hasMore: boolean;
} {
  const conditions: string[] = [];
  const params: (string | number | null)[] = [];

  if (filters.projectId !== undefined) {
    conditions.push('project_id = ?');
    params.push(filters.projectId);
  }
  if (filters.agentId !== undefined) {
    conditions.push('agent_id = ?');
    params.push(filters.agentId);
  }
  if (filters.terminalId !== undefined) {
    conditions.push('terminal_id = ?');
    params.push(filters.terminalId);
  }
  if (filters.type !== undefined) {
    conditions.push('type = ?');
    params.push(filters.type);
  }
  if (filters.since !== undefined) {
    conditions.push('created_at >= ?');
    params.push(filters.since);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;

  const countRow = db
    .prepare(`SELECT COUNT(*) AS total FROM events ${where}`)
    .get(...params) as Row;
  const total = (countRow.total as number) ?? 0;

  const events = rows<Event>(
    db
      .prepare(
        `SELECT * FROM events ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as Row[],
  );

  return { events, total, hasMore: offset + events.length < total };
}

// ─── Stats ───────────────────────────────────────────────────────────────────

export function getStats(): Stats {
  const eventsToday = (
    (db
      .prepare(`SELECT COUNT(*) AS n FROM events WHERE date(created_at) = date('now')`)
      .get() as Row).n as number
  );

  const activeAgents = (
    (db
      .prepare(`SELECT COUNT(*) AS n FROM agents WHERE status != 'offline'`)
      .get() as Row).n as number
  );

  const activeProjects = (
    (db
      .prepare(
        `SELECT COUNT(*) AS n FROM projects WHERE last_active >= datetime('now', '-24 hours')`,
      )
      .get() as Row).n as number
  );

  const lastEventRow = db
    .prepare(`SELECT * FROM events ORDER BY created_at DESC LIMIT 1`)
    .get() as Row | undefined;
  const lastEvent = lastEventRow ? row<Event>(lastEventRow) : undefined;

  return { eventsToday, activeAgents, activeProjects, lastEvent };
}

// ─── CompanyConfig ───────────────────────────────────────────────────────────

export function getCompanyConfig(): CompanyConfig {
  return row<CompanyConfig>(
    db.prepare(`SELECT * FROM company_config WHERE id = 1`).get() as Row,
  );
}

export function updateCompanyConfig(
  data: Partial<Omit<CompanyConfig, 'id' | 'updated_at'>>,
): CompanyConfig {
  const fields = Object.keys(data) as (keyof typeof data)[];
  if (fields.length === 0) return getCompanyConfig();

  const setClauses = fields.map((f) => `${f} = ?`).join(', ');
  const values = fields.map((f) => {
    const v = data[f];
    return v === undefined ? null : (v as string | number | null);
  });

  db.prepare(`
    UPDATE company_config
    SET ${setClauses}, updated_at = datetime('now')
    WHERE id = 1
  `).run(...values);

  return getCompanyConfig();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isValidTheme(value: unknown): value is ThemeName {
  return ['espacial', 'moderno', 'oldschool', 'cyberpunk'].includes(value as string);
}
