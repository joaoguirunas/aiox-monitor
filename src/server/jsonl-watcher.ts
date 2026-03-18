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
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CLAUDE_PROJECTS_DIR = join(homedir(), '.claude', 'projects');
const SCAN_INTERVAL_MS = 5_000;
const PERMISSION_TIMEOUT_MS = 7_000;
const POLL_INTERVAL_MS = 1_000;

// ─── State ──────────────────────────────────────────────────────────────────

const watchedFiles = new Map<string, WatchedFile>();
let scanInterval: ReturnType<typeof setInterval> | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let started = false;

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

/** Match JSONL to terminal by project directory path */
function findTerminalByProjectDir(projectDirName: string): { id: number; project_id: number } | null {
  // projectDirName is like "-Users-joaoramos-Desktop-aiox-monitor"
  // Convert to real path: replace leading "-" with "/", remaining "-" with "/"
  const realPath = '/' + projectDirName.slice(1).replace(/-/g, '/');
  try {
    // Find project by path
    const proj = db.prepare(
      `SELECT id FROM projects WHERE path = ? OR path LIKE ? LIMIT 1`,
    ).get(realPath, `%${realPath}%`) as Record<string, unknown> | undefined;
    if (!proj) return null;
    const projectId = proj.id as number;

    // Find most recently active terminal for this project
    const row = db.prepare(
      `SELECT id, project_id FROM terminals WHERE project_id = ? AND status != 'inactive' ORDER BY last_active DESC LIMIT 1`,
    ).get(projectId) as Record<string, unknown> | undefined;
    if (row) return { id: row.id as number, project_id: row.project_id as number };
  } catch { /* ignore */ }
  return null;
}

/** Try to find terminal by PID using lsof on the JSONL file */
async function findTerminalByLsof(filePath: string): Promise<{ id: number; project_id: number } | null> {
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync('lsof', ['-t', filePath], { timeout: 3000 });
    const pids = stdout.trim().split('\n').map(Number).filter(Boolean);
    for (const pid of pids) {
      const row = db.prepare(
        `SELECT id, project_id FROM terminals WHERE pid = ? AND status != 'inactive' ORDER BY last_active DESC LIMIT 1`,
      ).get(pid) as Record<string, unknown> | undefined;
      if (row) return { id: row.id as number, project_id: row.project_id as number };
    }
  } catch { /* lsof failed or no match */ }
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

  // Try to resolve terminal if not yet matched (3 strategies)
  if (wf.terminalId === null) {
    const match = findTerminalBySessionId(wf.sessionId)
      ?? findTerminalByProjectDir(wf.projectDirName);
    if (match) {
      wf.terminalId = match.id;
    } else {
      // Async fallback: lsof (will match on next event cycle)
      findTerminalByLsof(wf.path).then(m => {
        if (m && wf.terminalId === null) wf.terminalId = m.id;
      }).catch(() => {});
    }
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
  };

  // Try to match terminal immediately
  const match = findTerminalBySessionId(sessionId);
  if (match) wf.terminalId = match.id;

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
