/**
 * JSONL File Watcher — monitors ~/.claude/projects/ for transcript files,
 * parses them incrementally, enriches terminal data with tool details,
 * and detects permission waits.
 */

import { readdir, stat } from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  parseIncremental,
  createParserState,
  PERMISSION_EXEMPT_TOOLS,
  type ParserState,
  type TranscriptEvent,
} from './transcript-parser';
import { broadcast } from './ws-broadcaster';
import { db } from '../lib/db';

// ─── Types ──────────────────────────────────────────────────────────────────

interface WatchedFile {
  path: string;
  state: ParserState;
  watcher: FSWatcher | null;
  /** Active tools: toolId → friendlyStatus */
  activeTools: Map<string, string>;
  /** Active tool names: toolId → toolName */
  activeToolNames: Map<string, string>;
  /** Timestamp of last JSONL activity (for permission detection) */
  lastActivityMs: number;
  /** Whether permission timer is pending */
  permissionPending: boolean;
  /** Permission timer handle */
  permissionTimer: ReturnType<typeof setTimeout> | null;
  /** Terminal ID in DB (if matched) */
  terminalId: number | null;
  /** Session ID from the JSONL path */
  sessionId: string;
  /** Project directory name from path (e.g. "-Users-joaoramos-Desktop-app") */
  projectDirName: string;
  /** AIOX agent detected from early JSONL scan (deferred until terminal matched) */
  detectedAgent: string | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CLAUDE_PROJECTS_DIR = join(homedir(), '.claude', 'projects');
const SCAN_INTERVAL_MS = 30_000;  // Was 5s — scan for new files every 30s (not aggressive)
const PERMISSION_TIMEOUT_MS = 7_000;
const POLL_INTERVAL_MS = 5_000;   // Was 1s — poll fallback every 5s (fs.watch is primary)

// ─── State ──────────────────────────────────────────────────────────────────

const watchedFiles = new Map<string, WatchedFile>();
let scanInterval: ReturnType<typeof setInterval> | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let started = false;

// ─── Project path cache (avoids SELECT on every JSONL event) ────────────────

/** Map of Claude dir format → project ID, refreshed every 30s */
let projectPathCache = new Map<string, number>();
let projectPathCacheTime = 0;
const PROJECT_CACHE_TTL_MS = 30_000;

function getProjectPathCache(): Map<string, number> {
  const now = Date.now();
  if (now - projectPathCacheTime < PROJECT_CACHE_TTL_MS && projectPathCache.size > 0) {
    return projectPathCache;
  }
  try {
    const projects = db.prepare(`SELECT id, path FROM projects`).all() as Record<string, unknown>[];
    const cache = new Map<string, number>();
    for (const proj of projects) {
      const projPath = proj.path as string;
      const claudeFormat = '-' + projPath.slice(1).replace(/\//g, '-');
      cache.set(claudeFormat, proj.id as number);
    }
    projectPathCache = cache;
    projectPathCacheTime = now;
  } catch { /* keep stale cache */ }
  return projectPathCache;
}

// ─── DB helpers (direct SQL to avoid circular deps) ─────────────────────────

function findTerminalBySessionId(sessionId: string): { id: number; project_id: number } | null {
  try {
    const row = db.prepare(
      `SELECT id, project_id FROM terminals WHERE session_id = ? AND status != 'inactive' ORDER BY last_active DESC LIMIT 1`,
    ).get(sessionId) as Record<string, unknown> | undefined;
    if (row) return { id: row.id as number, project_id: row.project_id as number };
  } catch { /* ignore */ }
  return null;
}

/** Match JSONL to terminal by project directory path.
 *  ONLY used when there's exactly 1 active terminal for the project.
 *  With multiple terminals, returns null to force session_id or lsof matching. */
function findTerminalByProjectDir(projectDirName: string): { id: number; project_id: number } | null {
  try {
    const cache = getProjectPathCache();
    const projectId = cache.get(projectDirName);
    if (projectId === undefined) return null;

    // Count active terminals — if multiple, don't guess (return null)
    const countRow = db.prepare(
      `SELECT COUNT(*) as cnt FROM terminals WHERE project_id = ? AND status != 'inactive'`,
    ).get(projectId) as { cnt: number } | undefined;
    if ((countRow?.cnt ?? 0) > 1) return null;  // multiple terminals → need precise matching

    // Single terminal — safe to use
    const row = db.prepare(
      `SELECT id, project_id FROM terminals WHERE project_id = ? AND status != 'inactive' ORDER BY last_active DESC LIMIT 1`,
    ).get(projectId) as Record<string, unknown> | undefined;
    if (row) return { id: row.id as number, project_id: row.project_id as number };
  } catch { /* ignore */ }
  return null;
}


function updateTerminalToolDetail(terminalId: number, toolDetail: string | null, waitingPermission: number): void {
  try {
    db.prepare(
      `UPDATE terminals SET current_tool_detail = ?, waiting_permission = ?, last_active = datetime('now') WHERE id = ?`,
    ).run(toolDetail, waitingPermission, terminalId);
  } catch { /* ignore */ }
}

function setTerminalProcessing(terminalId: number): void {
  try {
    db.prepare(
      `UPDATE terminals SET status = 'processing', last_active = datetime('now') WHERE id = ?`,
    ).run(terminalId);
  } catch { /* ignore */ }
}

function setTerminalActive(terminalId: number): void {
  try {
    db.prepare(
      `UPDATE terminals SET status = 'active', current_tool_detail = NULL, waiting_permission = 0, last_active = datetime('now') WHERE id = ?`,
    ).run(terminalId);
  } catch { /* ignore */ }
}

function getTerminalForBroadcast(terminalId: number): Record<string, unknown> | null {
  try {
    const row = db.prepare(`SELECT * FROM terminals WHERE id = ?`).get(terminalId) as Record<string, unknown> | undefined;
    return row ?? null;
  } catch { return null; }
}

// ─── Agent Resolution ────────────────────────────────────────────────────────

const KNOWN_DISPLAY_NAMES: Record<string, string> = {
  'dev': 'Dex', 'qa': 'Quinn', 'architect': 'Aria', 'pm': 'Morgan',
  'sm': 'River', 'po': 'Pax', 'analyst': 'Atlas', 'devops': 'Gage',
  'data-engineer': 'Dara', 'ux-design-expert': 'Uma', 'aiox-master': 'AIOX',
};

function resolveAgentDisplayName(agentName: string): string {
  const id = agentName.startsWith('@') ? agentName.slice(1) : agentName;
  return KNOWN_DISPLAY_NAMES[id] ?? id.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** Apply a detected AIOX agent to a terminal and its active sessions */
function applyDetectedAgent(terminalId: number, agentName: string): void {
  try {
    const displayName = resolveAgentDisplayName(agentName);
    db.prepare(`UPDATE terminals SET agent_name = ?, agent_display_name = ? WHERE id = ?`)
      .run(agentName, displayName, terminalId);
    const projectId = (db.prepare(`SELECT project_id FROM terminals WHERE id = ?`).get(terminalId) as { project_id: number } | undefined)?.project_id;
    if (projectId) {
      db.prepare(
        `INSERT INTO agents (project_id, name, display_name, status, last_active)
         VALUES (?, ?, ?, 'working', datetime('now'))
         ON CONFLICT(project_id, name) DO UPDATE SET display_name = excluded.display_name, status = 'working', last_active = datetime('now')`,
      ).run(projectId, agentName, displayName);
      const agentRow = db.prepare(`SELECT id FROM agents WHERE project_id = ? AND name = ?`).get(projectId, agentName) as { id: number } | undefined;
      if (agentRow) {
        db.prepare(`UPDATE sessions SET agent_id = ? WHERE terminal_id = ? AND status = 'active'`).run(agentRow.id, terminalId);
      }
    }
    broadcastTerminalUpdate(terminalId);
  } catch { /* ignore */ }
}

// ─── Core Logic ─────────────────────────────────────────────────────────────

function sessionIdFromPath(filePath: string): string {
  // Path: ~/.claude/projects/<project-dir>/<session-id>.jsonl
  const parts = filePath.split('/');
  const filename = parts[parts.length - 1] ?? '';
  return filename.replace(/\.jsonl$/, '');
}

function projectDirFromPath(filePath: string): string {
  // Path: ~/.claude/projects/<project-dir>/<session-id>.jsonl
  const parts = filePath.split('/');
  return parts[parts.length - 2] ?? '';
}

function broadcastTerminalUpdate(terminalId: number): void {
  const terminal = getTerminalForBroadcast(terminalId);
  if (!terminal) return;
  try {
    broadcast({
      type: 'terminal:update',
      terminal,
      projectId: terminal.project_id as number,
    });
  } catch { /* ignore */ }
}

function handleEvents(wf: WatchedFile, events: TranscriptEvent[]): void {
  if (events.length === 0) return;

  // Try to resolve terminal (retry periodically — session_id may appear after first events)
  if (wf.terminalId === null) {
    // Strategy 1: match by Claude session ID (most reliable — set by hook from stdin)
    const match = findTerminalBySessionId(wf.sessionId)
      // Strategy 2: project dir (only works with single terminal per project)
      ?? findTerminalByProjectDir(wf.projectDirName);
    if (match) {
      wf.terminalId = match.id;
      // Apply deferred agent detection from startup scan
      if (wf.detectedAgent) {
        applyDetectedAgent(wf.terminalId, wf.detectedAgent);
      }
    }
    // No async lsof fallback — Claude doesn't keep JSONL files open
  }

  let changed = false;

  for (const event of events) {
    wf.lastActivityMs = Date.now();

    // Clear permission state on any JSONL activity
    if (wf.permissionPending) {
      wf.permissionPending = false;
      if (wf.terminalId !== null) {
        const detail = currentToolDetail(wf);
        updateTerminalToolDetail(wf.terminalId, detail, 0);
        changed = true;
      }
    }
    if (wf.permissionTimer) {
      clearTimeout(wf.permissionTimer);
      wf.permissionTimer = null;
    }

    if (event.type === 'agent_detected') {
      // AIOX agent activation detected in JSONL transcript — update terminal
      wf.detectedAgent = event.agentName;
      if (wf.terminalId !== null) {
        applyDetectedAgent(wf.terminalId, event.agentName);
        changed = true;
      }
      continue;
    }

    if (event.type === 'tool_start') {
      wf.activeTools.set(event.toolId, event.friendlyStatus);
      wf.activeToolNames.set(event.toolId, event.toolName);

      if (wf.terminalId !== null) {
        setTerminalProcessing(wf.terminalId);
        updateTerminalToolDetail(wf.terminalId, currentToolDetail(wf), 0);
        changed = true;
      }

      // Start permission timer (unless exempt tool)
      if (!PERMISSION_EXEMPT_TOOLS.has(event.toolName)) {
        startPermissionTimer(wf);
      }
    } else if (event.type === 'tool_done') {
      wf.activeTools.delete(event.toolId);
      wf.activeToolNames.delete(event.toolId);

      if (wf.terminalId !== null) {
        const detail = currentToolDetail(wf);
        updateTerminalToolDetail(wf.terminalId, detail, 0);
        if (wf.activeTools.size === 0) {
          // No tools active — but don't mark active yet, wait for turn_end
        }
        changed = true;
      }
    } else if (event.type === 'turn_end') {
      wf.activeTools.clear();
      wf.activeToolNames.clear();
      if (wf.permissionTimer) {
        clearTimeout(wf.permissionTimer);
        wf.permissionTimer = null;
      }
      wf.permissionPending = false;

      if (wf.terminalId !== null) {
        setTerminalActive(wf.terminalId);
        changed = true;
      }
    }
  }

  if (changed && wf.terminalId !== null) {
    broadcastTerminalUpdate(wf.terminalId);
  }
}

function currentToolDetail(wf: WatchedFile): string | null {
  if (wf.activeTools.size === 0) return null;
  // Show most recent tool
  const statuses = Array.from(wf.activeTools.values());
  return statuses[statuses.length - 1] ?? null;
}

function startPermissionTimer(wf: WatchedFile): void {
  if (wf.permissionTimer) clearTimeout(wf.permissionTimer);

  wf.permissionTimer = setTimeout(() => {
    // Check that no new activity happened
    const elapsed = Date.now() - wf.lastActivityMs;
    if (elapsed >= PERMISSION_TIMEOUT_MS - 500 && wf.activeTools.size > 0) {
      wf.permissionPending = true;
      if (wf.terminalId !== null) {
        updateTerminalToolDetail(wf.terminalId, currentToolDetail(wf), 1);
        broadcastTerminalUpdate(wf.terminalId);
      }
    }
    wf.permissionTimer = null;
  }, PERMISSION_TIMEOUT_MS);
}

// ─── File Watching ──────────────────────────────────────────────────────────

/** Quick scan of a JSONL file for agent activation patterns.
 *  Reads only the first 50KB — agent activation happens early in the transcript. */
async function scanForAgent(filePath: string): Promise<string | null> {
  try {
    const fh = await (await import('node:fs/promises')).open(filePath, 'r');
    try {
      const buf = Buffer.alloc(50_000);
      const { bytesRead } = await fh.read(buf, 0, 50_000, 0);
      const text = buf.toString('utf-8', 0, bytesRead);
      // Look for <command-message>AIOX:agents:X</command-message> or agents:X
      const match = text.match(/(?:AIOX:)?agents:([a-zA-Z0-9_-]+)/);
      if (match && match[1] !== 'unknown') return `@${match[1]}`;
    } finally {
      await fh.close();
    }
  } catch { /* ignore */ }
  return null;
}

async function watchFile(filePath: string): Promise<void> {
  if (watchedFiles.has(filePath)) return;

  const sessionId = sessionIdFromPath(filePath);
  const wf: WatchedFile = {
    path: filePath,
    state: createParserState(),
    watcher: null,
    activeTools: new Map(),
    activeToolNames: new Map(),
    lastActivityMs: Date.now(),
    permissionPending: false,
    permissionTimer: null,
    terminalId: null,
    sessionId,
    projectDirName: projectDirFromPath(filePath),
    detectedAgent: null,
  };

  // Try to match terminal immediately (session_id first, then single-terminal project fallback)
  const match = findTerminalBySessionId(sessionId)
    ?? findTerminalByProjectDir(wf.projectDirName);
  if (match) wf.terminalId = match.id;

  // Quick agent scan — detect AIOX agent from early transcript lines.
  // Store result on wf for deferred application once terminal is matched.
  wf.detectedAgent = await scanForAgent(filePath);
  if (wf.terminalId !== null && wf.detectedAgent) {
    applyDetectedAgent(wf.terminalId, wf.detectedAgent);
  }

  // Set up fs.watch (may fail on some systems)
  try {
    wf.watcher = watch(filePath, { persistent: false }, () => {
      processFile(wf).catch(() => {});
    });
    wf.watcher.on('error', () => {
      // Watcher died — polling fallback will handle it
      wf.watcher?.close();
      wf.watcher = null;
    });
  } catch {
    // fs.watch not supported — polling fallback
  }

  watchedFiles.set(filePath, wf);

  // Initial parse
  await processFile(wf);
}

async function processFile(wf: WatchedFile): Promise<void> {
  try {
    const events = await parseIncremental(wf.path, wf.state);
    handleEvents(wf, events);
  } catch {
    // File may have been deleted or is inaccessible
  }
}

// ─── Directory Scanning ─────────────────────────────────────────────────────

async function scanForJsonlFiles(): Promise<void> {
  try {
    const s = await stat(CLAUDE_PROJECTS_DIR);
    if (!s.isDirectory()) return;
  } catch {
    return; // ~/.claude/projects/ doesn't exist — graceful
  }

  try {
    const projectDirs = await readdir(CLAUDE_PROJECTS_DIR, { withFileTypes: true });

    for (const dir of projectDirs) {
      if (!dir.isDirectory()) continue;
      const dirPath = join(CLAUDE_PROJECTS_DIR, dir.name);

      try {
        const files = await readdir(dirPath);
        const now = Date.now();
        for (const file of files) {
          if (!file.endsWith('.jsonl')) continue;
          const filePath = join(dirPath, file);
          // Only watch files modified in the last hour (avoid watching 500+ stale files)
          try {
            const s = await stat(filePath);
            if (now - s.mtimeMs > 3600_000) continue;
          } catch { continue; }
          await watchFile(filePath);
        }
      } catch {
        // Can't read subdirectory — skip
      }
    }

    // Garbage collection: remove watchers for deleted files
    for (const [filePath, wf] of watchedFiles) {
      try {
        await stat(filePath);
      } catch {
        // File no longer exists
        wf.watcher?.close();
        if (wf.permissionTimer) clearTimeout(wf.permissionTimer);
        watchedFiles.delete(filePath);
      }
    }
  } catch {
    // Scan failed — try again next cycle
  }
}

/** Polling fallback: process all watched files periodically */
async function pollAllFiles(): Promise<void> {
  for (const wf of watchedFiles.values()) {
    await processFile(wf);
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function startJsonlWatcher(): Promise<void> {
  if (started) return;
  started = true;

  // Initial scan
  await scanForJsonlFiles();

  // Periodic scan for new files
  scanInterval = setInterval(() => {
    scanForJsonlFiles().catch(() => {});
  }, SCAN_INTERVAL_MS);

  // Polling fallback for file changes
  pollInterval = setInterval(() => {
    pollAllFiles().catch(() => {});
  }, POLL_INTERVAL_MS);

  console.log('[jsonl-watcher] started — monitoring', CLAUDE_PROJECTS_DIR);
}

export function stopJsonlWatcher(): void {
  if (scanInterval) clearInterval(scanInterval);
  if (pollInterval) clearInterval(pollInterval);
  for (const wf of watchedFiles.values()) {
    wf.watcher?.close();
    if (wf.permissionTimer) clearTimeout(wf.permissionTimer);
  }
  watchedFiles.clear();
  started = false;
}
