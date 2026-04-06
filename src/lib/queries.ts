import { db } from './db';
import { deleteTerminalsByProject, deleteOrphanedCategories } from './command-room-repository';
import type {
  Project,
  Agent,
  AgentWithStats,
  Terminal,
  Session,
  SessionWithSummary,
  SessionFilters,
  Event,
  EventFilters,
  CompanyConfig,
  ThemeName,
  ProjectWithDetails,
  Stats,
  GangaLog,
  AutopilotLog,
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

export function upsertProject(projectPath: string, name: string): { project: Project; isNew: boolean } {
  // Check if project already exists before upsert
  const existing = db.prepare(`SELECT id FROM projects WHERE path = ?`).get(projectPath) as Row | undefined;

  db.prepare(`
    INSERT INTO projects (name, path)
    VALUES (?, ?)
    ON CONFLICT(path) DO UPDATE SET
      name        = excluded.name,
      last_active = datetime('now')
  `).run(name, projectPath);

  const project = row<Project>(
    db.prepare(`SELECT * FROM projects WHERE path = ?`).get(projectPath) as Row,
  );

  return { project, isNew: !existing };
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

export function deleteProject(id: number): { deleted: boolean; commandRoomTerminals: number; orphanedCategories: number } {
  // Get project path before deleting (needed for command_room_terminals which has no FK)
  const project = getProjectById(id);
  if (!project) return { deleted: false, commandRoomTerminals: 0, orphanedCategories: 0 };

  // 1. Delete command_room_terminals (no FK to projects, uses project_path)
  const commandRoomTerminals = deleteTerminalsByProject(project.path);

  // 2. Delete from projects table (CASCADE handles agents, terminals, sessions, events, autopilot_log, ganga_log)
  const result = db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
  const deleted = (result as { changes: number }).changes > 0;

  // 3. Clean up orphaned categories (categories with no remaining terminals)
  const orphanedCategories = deleteOrphanedCategories();

  return { deleted, commandRoomTerminals, orphanedCategories };
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
  opts?: { displayName?: string; role?: string; team?: string },
): Agent {
  db.prepare(`
    INSERT INTO agents (project_id, name, display_name, role, team)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(project_id, name) DO UPDATE SET
      display_name = COALESCE(excluded.display_name, display_name),
      role         = COALESCE(excluded.role, role),
      team         = COALESCE(excluded.team, team),
      last_active  = datetime('now')
  `).run(projectId, name, opts?.displayName ?? null, opts?.role ?? null, opts?.team ?? null);

  // Force-fill role/team if they exist in the incoming opts but the DB still has NULL
  if (opts?.role || opts?.team) {
    db.prepare(`
      UPDATE agents SET
        role = CASE WHEN role IS NULL THEN ? ELSE role END,
        team = CASE WHEN team IS NULL THEN ? ELSE team END
      WHERE project_id = ? AND name = ?
    `).run(opts.role ?? null, opts.team ?? null, projectId, name);
  }

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

export function updateAgentFields(
  id: number,
  fields: { display_name?: string; role?: string; team?: string },
): void {
  const sets: string[] = [];
  const params: (string | null)[] = [];
  if (fields.display_name !== undefined) { sets.push('display_name = ?'); params.push(fields.display_name || null); }
  if (fields.role !== undefined) { sets.push('role = ?'); params.push(fields.role || null); }
  if (fields.team !== undefined) { sets.push('team = ?'); params.push(fields.team || null); }
  if (sets.length === 0) return;
  params.push(id as unknown as string);
  db.prepare(`UPDATE agents SET ${sets.join(', ')} WHERE id = ?`).run(...params);
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

/**
 * Returns one "agent instance" per active terminal with an agent assigned.
 * This allows the same agent (e.g. @dev) to appear multiple times in Empresa
 * when running in different terminals. Uses negative IDs (-(terminal.id)) to
 * avoid collision with real agent IDs.
 */
export function getAgentInstances(filters?: { projectId?: number }): AgentWithStats[] {
  const whereClause = filters?.projectId !== undefined
    ? 'WHERE t.project_id = ? AND'
    : 'WHERE';
  const params = filters?.projectId !== undefined ? [filters.projectId] : [];

  return rows<AgentWithStats>(
    db.prepare(`
      SELECT
        -(t.id) as id,
        t.project_id,
        COALESCE(NULLIF(t.agent_name, '@unknown'), '@worker') as name,
        CASE
          WHEN t.agent_display_name IS NOT NULL AND t.agent_display_name <> ''
            THEN t.agent_display_name
          WHEN t.window_title IS NOT NULL AND t.window_title <> ''
            THEN t.window_title
          ELSE COALESCE(NULLIF(t.agent_name, '@unknown'), 'Terminal')
        END as display_name,
        CASE
          WHEN t.status = 'processing' THEN 'working'
          WHEN t.status = 'active' THEN 'idle'
          ELSE 'offline'
        END as status,
        t.current_tool,
        t.current_tool_detail,
        t.waiting_permission,
        t.last_active,
        a.role,
        a.team,
        1 as terminal_count
      FROM terminals t
      LEFT JOIN agents a ON a.project_id = t.project_id AND a.name = t.agent_name
      ${whereClause} t.status <> 'inactive'
      ORDER BY t.last_active DESC
    `).all(...params) as Row[],
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
    windowTitle?: string;
  },
): Terminal {
  const o = opts ?? {};
  db.prepare(`
    INSERT INTO terminals (project_id, pid, session_id, status, agent_name, agent_display_name, current_tool, current_input, window_title)
    VALUES (?, ?, ?, 'processing', ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, pid) DO UPDATE SET
      session_id         = COALESCE(excluded.session_id, terminals.session_id),
      status             = 'processing',
      -- Agent fields: NULL = preserve existing, '' = clear, other = set new value.
      -- Empty string signals "no agent detected on new prompt" → reset to NULL.
      agent_name         = CASE
        WHEN excluded.agent_name = '' THEN NULL
        WHEN excluded.agent_name IS NOT NULL THEN excluded.agent_name
        ELSE terminals.agent_name
      END,
      agent_display_name = CASE
        WHEN excluded.agent_display_name = '' THEN NULL
        WHEN excluded.agent_display_name IS NOT NULL THEN excluded.agent_display_name
        ELSE terminals.agent_display_name
      END,
      current_tool       = CASE
        WHEN excluded.current_tool IS NOT NULL THEN excluded.current_tool
        ELSE terminals.current_tool
      END,
      current_input      = CASE
        WHEN excluded.current_input IS NOT NULL THEN excluded.current_input
        ELSE terminals.current_input
      END,
      window_title       = CASE
        WHEN excluded.window_title IS NOT NULL THEN excluded.window_title
        ELSE terminals.window_title
      END,
      current_tool_detail = terminals.current_tool_detail,
      waiting_permission = 0,
      first_seen_at      = CASE
        WHEN terminals.first_seen_at IS NULL THEN datetime('now')
        ELSE terminals.first_seen_at
      END,
      last_active        = datetime('now')
  `).run(
    projectId,
    pid,
    o.sessionId ?? null,
    o.agentName ?? null,
    o.agentDisplayName ?? null,
    o.currentTool ?? null,
    o.currentInput ?? null,
    o.windowTitle ?? null,
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
    SET status = 'inactive', waiting_permission = 0, current_tool_detail = NULL, last_active = datetime('now')
    WHERE project_id = ? AND pid = ?
  `).run(projectId, pid);
}

export function getStaleTerminals(olderThanSeconds = 7200): Terminal[] {
  return rows<Terminal>(
    db.prepare(`
      SELECT * FROM terminals
      WHERE status IN ('processing', 'active')
        AND last_active < datetime('now', '-' || ? || ' seconds')
    `).all(olderThanSeconds) as Row[],
  );
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

export function getAllTerminals(): Terminal[] {
  return rows<Terminal>(
    db.prepare(`SELECT * FROM terminals ORDER BY last_active DESC`).all() as Row[],
  );
}

export function updateTerminalWindowTitle(id: number, windowTitle: string): void {
  db.prepare(`UPDATE terminals SET window_title = ? WHERE id = ?`).run(windowTitle, id);
}

export function setTerminalActive(id: number): void {
  db.prepare(`UPDATE terminals SET status = 'active', last_active = datetime('now') WHERE id = ? AND status = 'inactive'`).run(id);
}

export function getPurgeableTerminals(olderThanSeconds = 86400): Terminal[] {
  const aged = rows<Terminal>(
    db.prepare(`
      SELECT * FROM terminals
      WHERE status = 'inactive'
        AND last_active < datetime('now', '-' || ? || ' seconds')
    `).all(olderThanSeconds) as Row[],
  );
  const dupes = rows<Terminal>(
    db.prepare(`
      SELECT * FROM terminals
      WHERE id NOT IN (
        SELECT MAX(id) FROM terminals GROUP BY project_id, pid
      )
    `).all() as Row[],
  );
  // Merge without duplicates by id
  const seen = new Set(aged.map(t => t.id));
  for (const d of dupes) {
    if (!seen.has(d.id)) { aged.push(d); seen.add(d.id); }
  }
  return aged;
}

/** Remove inactive terminals older than the given threshold, plus duplicates (same PID, keep newest). */
export function purgeOldInactiveTerminals(olderThanSeconds = 86400): number {
  // 1. Delete inactive terminals older than threshold
  const r1 = db.prepare(`
    DELETE FROM terminals
    WHERE status = 'inactive'
      AND last_active < datetime('now', '-' || ? || ' seconds')
  `).run(olderThanSeconds);

  // 2. Delete duplicate PIDs: keep the most recent row per (project_id, pid)
  const r2 = db.prepare(`
    DELETE FROM terminals
    WHERE id NOT IN (
      SELECT MAX(id) FROM terminals GROUP BY project_id, pid
    )
  `).run();

  return (r1 as { changes: number }).changes + (r2 as { changes: number }).changes;
}

export function setTerminalAutopilot(id: number, enabled: boolean): Terminal | null {
  db.prepare(`UPDATE terminals SET autopilot = ? WHERE id = ?`).run(enabled ? 1 : 0, id);
  const r = db.prepare(`SELECT * FROM terminals WHERE id = ?`).get(id) as Row | undefined;
  return r ? row<Terminal>(r) : null;
}

export function getTerminalAgentByPid(pid: number): string | null {
  const r = db.prepare(`
    SELECT agent_name FROM terminals
    WHERE pid = ? AND agent_name IS NOT NULL AND agent_name != '@unknown'
    ORDER BY last_active DESC LIMIT 1
  `).get(pid) as Row | undefined;
  return r ? (r.agent_name as string) : null;
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

/** Close all active sessions tied to a specific terminal (orphan cleanup). */
export function closeSessionsByTerminal(terminalId: number): number {
  const result = db.prepare(`
    UPDATE sessions
    SET ended_at = datetime('now'), status = 'completed'
    WHERE terminal_id = ? AND status = 'active'
  `).run(terminalId);
  return (result as { changes: number }).changes;
}

export function getSessions(filters: SessionFilters = {}): {
  sessions: SessionWithSummary[];
  total: number;
  hasMore: boolean;
} {
  const conditions: string[] = [];
  const params: (string | number | null)[] = [];

  if (filters.projectId !== undefined) {
    conditions.push('s.project_id = ?');
    params.push(filters.projectId);
  }
  if (filters.agentId !== undefined) {
    conditions.push('s.agent_id = ?');
    params.push(filters.agentId);
  }
  if (filters.terminalId !== undefined) {
    conditions.push('s.terminal_id = ?');
    params.push(filters.terminalId);
  }
  if (filters.status !== undefined) {
    conditions.push('s.status = ?');
    params.push(filters.status);
  }
  if (filters.since !== undefined) {
    conditions.push('s.started_at >= ?');
    params.push(filters.since);
  }
  if (filters.until !== undefined) {
    conditions.push('s.started_at <= ?');
    params.push(filters.until);
  }
  if (filters.search) {
    conditions.push('EXISTS (SELECT 1 FROM events e WHERE e.session_id = s.id AND (e.input_summary LIKE ? OR e.output_summary LIKE ?))');
    const like = `%${filters.search}%`;
    params.push(like, like);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit ?? 20;
  const offset = filters.offset ?? 0;

  const countRow = db
    .prepare(`SELECT COUNT(*) AS total FROM sessions s ${where}`)
    .get(...params) as Row;
  const total = (countRow.total as number) ?? 0;

  const sessionRows = rows<SessionWithSummary & { tools: string | null; skill_raw: string | null }>(
    db
      .prepare(`
        SELECT s.*,
          p.name as project_name,
          a.name as agent_name,
          a.display_name as agent_display_name,
          t.window_title as terminal_title,
          t.status as terminal_status,
          t.pid as terminal_pid,
          t.agent_name as terminal_agent_name,
          t.agent_display_name as terminal_agent_display_name,
          t.current_tool_detail as terminal_current_tool_detail,
          t.waiting_permission as terminal_waiting_permission,
          (SELECT e.input_summary FROM events e
           WHERE e.session_id = s.id AND e.type = 'UserPromptSubmit'
           ORDER BY e.id ASC LIMIT 1) as prompt,
          (SELECT e.input_summary FROM events e
           WHERE e.session_id = s.id AND e.tool = 'Skill'
           AND e.type = 'PreToolUse'
           ORDER BY e.id ASC LIMIT 1) as skill_raw,
          (SELECT e.input_summary FROM events e
           WHERE e.session_id = s.id AND e.type IN ('Stop', 'SubagentStop')
           ORDER BY e.id DESC LIMIT 1) as response,
          (SELECT COUNT(*) FROM events e
           WHERE e.session_id = s.id AND e.type = 'PreToolUse') as tool_count,
          (SELECT GROUP_CONCAT(DISTINCT e.tool) FROM events e
           WHERE e.session_id = s.id AND e.tool IS NOT NULL
           AND e.type IN ('PreToolUse', 'PostToolUse')) as tools
        FROM sessions s
        LEFT JOIN projects p ON p.id = s.project_id
        LEFT JOIN agents a ON a.id = s.agent_id
        LEFT JOIN terminals t ON t.id = s.terminal_id
        ${where}
        ORDER BY s.started_at DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset) as Row[],
  );

  // Convert tools from comma-separated string to array + extract skill name
  const sessions: SessionWithSummary[] = sessionRows.map((s) => {
    let skill: string | undefined;
    if (s.skill_raw) {
      try {
        const parsed = JSON.parse(s.skill_raw as string);
        const raw = parsed?.skill ?? s.skill_raw;
        // "AIOX:agents:dev" → "dev", "commit" → "commit"
        skill = typeof raw === 'string' ? raw.replace(/^.*:/, '') : undefined;
      } catch {
        skill = (s.skill_raw as string).replace(/^.*:/, '');
      }
    }
    const { skill_raw: _raw, ...rest } = s;
    return {
      ...rest,
      skill,
      tools: s.tools ? s.tools.split(',') : [],
    };
  });

  return { sessions, total, hasMore: offset + sessions.length < total };
}

export function getSessionEvents(sessionId: number): Event[] {
  return rows<Event>(
    db
      .prepare(`SELECT * FROM events WHERE session_id = ? ORDER BY id ASC`)
      .all(sessionId) as Row[],
  );
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
  if (filters.until !== undefined) {
    conditions.push('created_at <= ?');
    params.push(filters.until);
  }
  if (filters.search) {
    conditions.push('(input_summary LIKE ? OR output_summary LIKE ?)');
    const like = `%${filters.search}%`;
    params.push(like, like);
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

// ─── Terminal Health ─────────────────────────────────────────────────────────

export interface TerminalHealth {
  total: number;
  active: number;
  inactive: number;
  duplicateSessions: number;
  orphanTerminals: number;
  enrichedCount: number;
  enrichmentRate: number;
  waitingPermission: number;
}

export function getTerminalHealth(): TerminalHealth {
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM terminals`).get() as Row).n as number;
  const active = (db.prepare(`SELECT COUNT(*) AS n FROM terminals WHERE status != 'inactive'`).get() as Row).n as number;
  const inactive = (db.prepare(`SELECT COUNT(*) AS n FROM terminals WHERE status = 'inactive'`).get() as Row).n as number;

  const duplicateSessions = (db.prepare(`
    SELECT COUNT(*) AS n FROM (
      SELECT session_id FROM terminals
      WHERE session_id IS NOT NULL AND status != 'inactive'
      GROUP BY session_id HAVING COUNT(*) > 1
    )
  `).get() as Row).n as number;

  const orphanTerminals = (db.prepare(`
    SELECT COUNT(*) AS n FROM terminals
    WHERE session_id IS NULL AND status != 'inactive'
  `).get() as Row).n as number;

  const enrichedCount = (db.prepare(`
    SELECT COUNT(*) AS n FROM terminals
    WHERE status != 'inactive' AND current_tool_detail IS NOT NULL
  `).get() as Row).n as number;

  const enrichmentRate = active > 0 ? enrichedCount / active : 0;

  const waitingPermission = (db.prepare(`
    SELECT COUNT(*) AS n FROM terminals WHERE waiting_permission = 1
  `).get() as Row).n as number;

  return {
    total,
    active,
    inactive,
    duplicateSessions,
    orphanTerminals,
    enrichedCount,
    enrichmentRate,
    waitingPermission,
  };
}

// ─── Ganga Ativo ──────────────────────────────────────────────────────────────

export function insertGangaLog(data: Omit<GangaLog, 'id' | 'created_at'>): GangaLog {
  const result = db.prepare(`
    INSERT INTO ganga_log (terminal_id, project_id, prompt_text, response, classification, action)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    data.terminal_id ?? null,
    data.project_id ?? null,
    data.prompt_text,
    data.response,
    data.classification,
    data.action,
  );
  return row<GangaLog>(
    db.prepare(`SELECT * FROM ganga_log WHERE id = ?`).get(Number(result.lastInsertRowid)) as Row,
  );
}

export function getGangaLogs(limit = 50): GangaLog[] {
  return rows<GangaLog>(
    db.prepare(`SELECT * FROM ganga_log ORDER BY created_at DESC LIMIT ?`).all(limit) as Row[],
  );
}

// ─── Autopilot ──────────────────────────────────────────────────────────────

export function getAutopilotTerminals(): Terminal[] {
  return rows<Terminal>(
    db.prepare(`
      SELECT * FROM terminals
      WHERE autopilot = 1
        AND status != 'inactive'
        AND waiting_permission = 1
      ORDER BY last_active DESC
    `).all() as Row[],
  );
}

export function insertAutopilotLog(data: Omit<AutopilotLog, 'id' | 'created_at'>): AutopilotLog {
  const result = db.prepare(`
    INSERT INTO autopilot_log (terminal_id, project_id, window_title, agent_name, action, detail)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    data.terminal_id,
    data.project_id,
    data.window_title ?? null,
    data.agent_name ?? null,
    data.action,
    data.detail ?? null,
  );
  return row<AutopilotLog>(
    db.prepare(`SELECT * FROM autopilot_log WHERE id = ?`).get(Number(result.lastInsertRowid)) as Row,
  );
}

export function getAutopilotLogs(limit = 50): AutopilotLog[] {
  return rows<AutopilotLog>(
    db.prepare(`SELECT * FROM autopilot_log ORDER BY created_at DESC LIMIT ?`).all(limit) as Row[],
  );
}

export function getAutopilotStats(): { approved: number; errors: number; skipped: number } {
  const r = db.prepare(`
    SELECT
      SUM(CASE WHEN action = 'permission_approve' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN action = 'error' THEN 1 ELSE 0 END) as errors,
      SUM(CASE WHEN action = 'idle_skip' THEN 1 ELSE 0 END) as skipped
    FROM autopilot_log
    WHERE created_at >= datetime('now', '-24 hours')
  `).get() as Row;
  return {
    approved: (r.approved as number) ?? 0,
    errors: (r.errors as number) ?? 0,
    skipped: (r.skipped as number) ?? 0,
  };
}

export function getGangaStats(): { autoResponses: number; blocked: number; skipped: number } {
  const r = db.prepare(`
    SELECT
      SUM(CASE WHEN action = 'auto-responded' THEN 1 ELSE 0 END) as auto_responses,
      SUM(CASE WHEN action = 'blocked' THEN 1 ELSE 0 END) as blocked,
      SUM(CASE WHEN action = 'skipped' THEN 1 ELSE 0 END) as skipped
    FROM ganga_log
    WHERE created_at >= datetime('now', '-24 hours')
  `).get() as Row;
  return {
    autoResponses: (r.auto_responses as number) ?? 0,
    blocked: (r.blocked as number) ?? 0,
    skipped: (r.skipped as number) ?? 0,
  };
}
