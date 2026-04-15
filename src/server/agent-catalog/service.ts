/**
 * Agent Catalog Service — JOB-021
 * Singleton service that:
 * 1. Manages open projects (lifecycle: open → watch → close → unwatch)
 * 2. Maintains LRU cache of scan results (max 10 projects)
 * 3. Persists catalog to SQLite (agent_catalog + agent_groups tables)
 * 4. Broadcasts WS events: catalog.updated, catalog.reloaded, project.opened, project.closed
 *
 * Called by:
 * - POST /api/projects/open  → openProject()
 * - POST /api/projects/close → closeProject()
 * - GET  /api/agents/catalog → getCatalog()
 */

import { db } from '../../lib/db';
import { broadcast } from '../ws-broadcaster';
import { fullScan, watchProject } from './scanner';
import type { AgentCatalogEntry, GroupCatalogEntry } from './parser';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OpenProjectInfo {
  project_path: string;
  opened_at: string;
  last_refreshed_at: string;
}

// ─── LRU Cache ────────────────────────────────────────────────────────────────

const MAX_CACHE_SIZE = 10;

interface CacheEntry {
  agents: AgentCatalogEntry[];
  groups: GroupCatalogEntry[];
  cachedAt: number;
}

const catalogCache = new Map<string, CacheEntry>();

function setCache(projectPath: string, agents: AgentCatalogEntry[], groups: GroupCatalogEntry[]): void {
  // LRU eviction: remove oldest when full
  if (catalogCache.size >= MAX_CACHE_SIZE && !catalogCache.has(projectPath)) {
    const oldest = catalogCache.keys().next().value;
    if (oldest) catalogCache.delete(oldest);
  }
  catalogCache.set(projectPath, { agents, groups, cachedAt: Date.now() });
}

// ─── Active project watchers ──────────────────────────────────────────────────

const activeWatchers = new Map<string, () => void>(); // projectPath → cleanup fn

// ─── Broadcast seq counter ────────────────────────────────────────────────────

let _seq = 0;
function nextSeq(): number { return ++_seq; }
function nowIso(): string { return new Date().toISOString(); }

// ─── DB helpers ───────────────────────────────────────────────────────────────

function upsertCatalogEntry(entry: AgentCatalogEntry): void {
  db.prepare(`
    INSERT INTO agent_catalog
      (project_path, skill_path, squad, agent_id, display_name, icon, role, description,
       definition_path, source, persona_tags, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_path, skill_path) DO UPDATE SET
      squad           = excluded.squad,
      agent_id        = excluded.agent_id,
      display_name    = excluded.display_name,
      icon            = excluded.icon,
      role            = excluded.role,
      description     = excluded.description,
      definition_path = excluded.definition_path,
      source          = excluded.source,
      persona_tags    = excluded.persona_tags,
      last_seen_at    = excluded.last_seen_at
  `).run(
    entry.project_path,
    entry.skill_path,
    entry.squad,
    entry.agent_id,
    entry.display_name,
    entry.icon,
    entry.role,
    entry.description,
    entry.definition_path,
    entry.source,
    JSON.stringify(entry.persona_tags),
    entry.last_seen_at,
  );
}

function upsertGroupEntry(entry: GroupCatalogEntry): void {
  db.prepare(`
    INSERT INTO agent_groups
      (project_path, group_id, name, description, squad, member_skill_paths,
       topology, source, definition_path, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_path, group_id) DO UPDATE SET
      name               = excluded.name,
      description        = excluded.description,
      squad              = excluded.squad,
      member_skill_paths = excluded.member_skill_paths,
      topology           = excluded.topology,
      source             = excluded.source,
      definition_path    = excluded.definition_path,
      last_seen_at       = excluded.last_seen_at
  `).run(
    entry.project_path,
    entry.group_id,
    entry.name,
    entry.description,
    entry.squad,
    JSON.stringify(entry.member_skill_paths),
    entry.topology,
    entry.source,
    entry.definition_path,
    new Date().toISOString(),
  );
}

function persistScanResult(agents: AgentCatalogEntry[], groups: GroupCatalogEntry[]): void {
  for (const agent of agents) upsertCatalogEntry(agent);
  for (const group of groups) upsertGroupEntry(group);
}

// ─── Core service functions ───────────────────────────────────────────────────

/**
 * Open a project: scan catalog, persist to DB, set up fs.watch, broadcast WS.
 */
export function openProject(projectPath: string): { agents: AgentCatalogEntry[]; groups: GroupCatalogEntry[] } {
  // Upsert into open_projects
  db.prepare(`
    INSERT INTO open_projects (project_path, opened_at, last_refreshed_at)
    VALUES (?, datetime('now'), datetime('now'))
    ON CONFLICT(project_path) DO UPDATE SET
      opened_at          = datetime('now'),
      last_refreshed_at  = datetime('now')
  `).run(projectPath);

  // Initial scan
  const { agents, groups } = fullScan(projectPath);
  setCache(projectPath, agents, groups);
  persistScanResult(agents, groups);

  broadcast({ type: 'project.opened', v: 1, seq: nextSeq(), at: nowIso(), projectPath });
  broadcast({ type: 'catalog.reloaded', v: 1, seq: nextSeq(), at: nowIso(), projectPath, full: agents });

  // Set up watcher (idempotent — close existing first)
  if (activeWatchers.has(projectPath)) {
    activeWatchers.get(projectPath)!();
  }
  const cleanup = watchProject(projectPath, handleCatalogChange);
  activeWatchers.set(projectPath, cleanup);

  return { agents, groups };
}

/**
 * Close a project: stop watcher, remove from open_projects, broadcast WS.
 */
export function closeProject(projectPath: string): void {
  const cleanup = activeWatchers.get(projectPath);
  if (cleanup) {
    cleanup();
    activeWatchers.delete(projectPath);
  }

  db.prepare(`DELETE FROM open_projects WHERE project_path = ?`).run(projectPath);

  broadcast({ type: 'project.closed', v: 1, seq: nextSeq(), at: nowIso(), projectPath });
}

/**
 * Get catalog for a project from cache → DB → full scan (lazy).
 */
export function getCatalog(projectPath: string): { agents: AgentCatalogEntry[]; groups: GroupCatalogEntry[] } {
  // Cache hit
  const cached = catalogCache.get(projectPath);
  if (cached) {
    return { agents: cached.agents, groups: cached.groups };
  }

  // DB hit (project was previously scanned)
  const dbAgents = db.prepare(`
    SELECT * FROM agent_catalog WHERE project_path = ? ORDER BY squad, agent_id
  `).all(projectPath) as (Omit<AgentCatalogEntry, 'persona_tags' | 'parse_warnings'> & { persona_tags: string })[];

  const dbGroups = db.prepare(`
    SELECT * FROM agent_groups WHERE project_path = ? ORDER BY squad, group_id
  `).all(projectPath) as (Omit<GroupCatalogEntry, 'member_skill_paths' | 'invalid_members' | 'parse_warnings'> & { member_skill_paths: string })[];

  if (dbAgents.length > 0) {
    const agents = dbAgents.map(row => ({
      ...row,
      persona_tags: tryParseJson(row.persona_tags, []) as string[],
      parse_warnings: [],
    }));
    const groups = dbGroups.map(row => ({
      ...row,
      member_skill_paths: tryParseJson(row.member_skill_paths, []) as string[],
      invalid_members: [],
      parse_warnings: [],
    }));
    setCache(projectPath, agents, groups);
    return { agents, groups };
  }

  // Cold path: full scan
  const { agents, groups } = fullScan(projectPath);
  setCache(projectPath, agents, groups);
  persistScanResult(agents, groups);
  return { agents, groups };
}

/**
 * List open projects (MRU: most recently opened first).
 */
export function getOpenProjects(): OpenProjectInfo[] {
  return db.prepare(`
    SELECT project_path, opened_at, last_refreshed_at
    FROM open_projects
    ORDER BY opened_at DESC
  `).all() as unknown as OpenProjectInfo[];
}

/**
 * Called by fs.watch when any .md file changes under a watched project.
 */
function handleCatalogChange(projectPath: string): void {
  const prevCache = catalogCache.get(projectPath);
  const { agents: newAgents, groups: newGroups } = fullScan(projectPath);

  setCache(projectPath, newAgents, newGroups);
  persistScanResult(newAgents, newGroups);

  // Update refresh timestamp
  db.prepare(`
    UPDATE open_projects SET last_refreshed_at = datetime('now') WHERE project_path = ?
  `).run(projectPath);

  if (!prevCache) {
    broadcast({ type: 'catalog.reloaded', v: 1, seq: nextSeq(), at: nowIso(), projectPath, full: newAgents });
    return;
  }

  // Compute delta for catalog.updated event
  const prevSkills = new Set(prevCache.agents.map(a => a.skill_path));
  const newSkills = new Set(newAgents.map(a => a.skill_path));
  const added = newAgents.filter(a => !prevSkills.has(a.skill_path));
  const removed = [...prevSkills].filter(s => !newSkills.has(s));

  broadcast({
    type: 'catalog.updated',
    v: 1,
    seq: nextSeq(),
    at: nowIso(),
    projectPath,
    added,
    removed,
  });
}

// ─── Util ─────────────────────────────────────────────────────────────────────

function tryParseJson<T>(s: string, fallback: T): T {
  try { return JSON.parse(s); } catch { return fallback; }
}
