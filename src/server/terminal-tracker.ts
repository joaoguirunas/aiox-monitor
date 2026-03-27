import {
  upsertTerminal,
  deactivateTerminal as dbDeactivateTerminal,
  deactivateStaleTerminals,
  getStaleTerminals,
  getPurgeableTerminals,
  markTerminalsActive,
  getTerminalsByProject,
  getAllTerminals,
  updateTerminalWindowTitle,
  setTerminalActive,
  getProjects,
  purgeOldInactiveTerminals,
} from '../lib/queries';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
import { broadcast } from './ws-broadcaster';
import { detectSystemTerminals } from './terminal-detector';
import { db } from '../lib/db';
import type { Terminal } from '../lib/types';

// Cache window titles by PID — detected once, reused across events
const windowTitleCache = new Map<number, string>();


let lastDetectionTime = 0;
let cachedDetectionResult: Awaited<ReturnType<typeof detectSystemTerminals>> = [];

function cleanTitle(raw: string): string {
  let title = raw
    // Remove trailing parenthetical info
    .replace(/\s*\([^)]*\)\s*$/i, '')
    // Remove Claude Code status indicators (⠂ ✳ ⣿ etc.)
    .replace(/^[⠂✳⣿⣾⣽⣻⣟⡿⢿⣯⣷●◉◈⬤☐☑✓✔✕✖✗✘⚡⏳🔄]+\s*/u, '')
    // Remove Terminal.app verbose suffix: " — command ◂ ... — 101×18"
    .replace(/\s*—\s*.*◂.*$/i, '')
    .replace(/\s*—\s*\d+×\d+\s*$/, '')
    .trim();
  // If still too long (wName can be verbose), take first segment before " — "
  if (title.length > 60) {
    const firstSegment = title.split(/\s*—\s*/)[0];
    if (firstSegment) title = firstSegment.trim();
  }
  return title;
}

async function refreshDetectionCache(): Promise<void> {
  const now = Date.now();
  if (now - lastDetectionTime < 10_000) return;
  try {
    cachedDetectionResult = await detectSystemTerminals();
    lastDetectionTime = now;
  } catch {
    // Detection failed
  }
}

async function detectWindowTitle(pid: number): Promise<string | undefined> {
  if (windowTitleCache.has(pid)) return windowTitleCache.get(pid);

  await refreshDetectionCache();

  const match = cachedDetectionResult.find(t => t.pid === pid);
  if (match) {
    const raw = match.windowName || match.profileName || `${match.app} — Tab ${match.tabIndex + 1}`;
    const title = cleanTitle(raw);
    windowTitleCache.set(pid, title);
    return title;
  }

  return undefined;
}

export function trackTerminal(
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
  // Priority: explicit windowTitle (Maestri name) > cached > async detection
  const title = opts?.windowTitle || windowTitleCache.get(pid);
  if (opts?.windowTitle) windowTitleCache.set(pid, opts.windowTitle);

  const enrichedOpts = { ...opts, windowTitle: title };
  const terminal = upsertTerminal(projectId, pid, enrichedOpts);

  // Trigger async detection if no title at all — update DB + broadcast when found
  if (!title) {
    detectWindowTitle(pid).then(detected => {
      if (detected) {
        const updated = upsertTerminal(projectId, pid, { windowTitle: detected });
        try { broadcast({ type: 'terminal:update', terminal: updated, projectId }); } catch { /* ignore */ }
      }
    }).catch(() => { /* ignore */ });
  }

  return terminal;
}

export function deactivateTerminal(projectId: number, pid: number): void {
  // Get terminal id before deactivation for the removed broadcast
  const terminalBefore = getTerminalsByProject(projectId).find(t => t.pid === pid);
  dbDeactivateTerminal(projectId, pid);
  windowTitleCache.delete(pid);
  try {
    if (terminalBefore) {
      broadcast({ type: 'terminal:removed', terminalId: terminalBefore.id, projectId });
    }
  } catch { /* fire-and-forget */ }
}

export function cleanupStaleTerminals(): void {
  markTerminalsActive(300);       // processing > 5min without event → active (idle)

  // Collect terminals that will be deactivated (stale) before the operation
  const staleTerminals = getStaleTerminals(900);
  deactivateStaleTerminals(900);  // no activity for 15min → inactive

  // Broadcast removal for each deactivated terminal
  for (const t of staleTerminals) {
    try { broadcast({ type: 'terminal:removed', terminalId: t.id, projectId: t.project_id }); } catch { /* ignore */ }
  }

  // Collect terminals that will be purged before the operation
  const purgeableTerminals = getPurgeableTerminals(3600);
  purgeOldInactiveTerminals(3600); // delete inactive > 1h + deduplicate PIDs

  // Broadcast removal for each purged terminal (skip already broadcast stale ones)
  const alreadyBroadcast = new Set(staleTerminals.map(t => t.id));
  for (const t of purgeableTerminals) {
    if (alreadyBroadcast.has(t.id)) continue;
    try { broadcast({ type: 'terminal:removed', terminalId: t.id, projectId: t.project_id }); } catch { /* ignore */ }
  }
}

/**
 * Proactive sync: detect all system terminals (iTerm2 + Terminal.app)
 * and update the DB with window titles + reactivate terminals that are still alive.
 * Also CREATES new terminal entries for claude processes detected on the system
 * but not yet in the DB (e.g. after PID recycling or fresh spawns).
 */
export async function syncSystemTerminals(): Promise<void> {
  try {
    const detected = await detectSystemTerminals();
    if (detected.length === 0) return;

    const dbTerminals = getAllTerminals();
    const projects = getProjects();

    // Build a PID → detected info map (only entries with a valid PID)
    const detectedByPid = new Map(
      detected.filter(d => d.pid).map(d => [d.pid!, d]),
    );

    // Detection complete: match detected PIDs to DB terminals

    // Build a set of PIDs already in the DB
    const dbPidSet = new Set(dbTerminals.map(t => t.pid));

    // ── 1. Update existing terminals: match by PID, update title + reactivate ──
    // IMPORTANT: sync only fills EMPTY titles. It never overwrites titles that
    // were set by events (maestri-resolver, hook agent names, etc.) because the
    // detector returns generic placeholders ("Maestri", profile names) that are
    // less accurate than event-driven data.
    for (const dbTerm of dbTerminals) {
      const match = detectedByPid.get(dbTerm.pid);
      if (!match) continue;

      let changed = false;

      // Only set title if the terminal has NO title yet
      if (!dbTerm.window_title) {
        const title = cleanTitle(match.windowName || match.profileName || '');
        // Skip generic/placeholder titles from detector
        if (title && !/^(maestri|claude code|claude|terminal|zsh|bash)$/i.test(title)) {
          updateTerminalWindowTitle(dbTerm.id, title);
          windowTitleCache.set(dbTerm.pid, title);
          changed = true;
        }
      }

      // Only reactivate if it's a confirmed claude process (not a fallback PID like esbuild)
      if (dbTerm.status === 'inactive' && match.isClaudeProcess) {
        setTerminalActive(dbTerm.id);
        changed = true;
      }

      if (changed) {
        const updated = getTerminalsByProject(dbTerm.project_id).find(t => t.id === dbTerm.id);
        if (updated) {
          try { broadcast({ type: 'terminal:update', terminal: updated, projectId: dbTerm.project_id }); } catch { /* ignore */ }
        }
      }
    }

    // Pre-compute PGIDs for active DB terminals — single ps call instead of N forks
    const activeDbPgids = new Set<string>();
    const activePids = dbTerminals.filter(t => t.status !== 'inactive').map(t => String(t.pid));
    if (activePids.length > 0) {
      try {
        const { stdout } = await execFileAsync('ps', ['-o', 'pid=,pgid=', '-p', activePids.join(',')], { encoding: 'utf-8', timeout: 3000 });
        for (const line of stdout.trim().split('\n')) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 2 && parts[1]) activeDbPgids.add(parts[1]);
        }
      } catch { /* ps failed — skip PGID dedup */ }
    }

    // ── 2. Create NEW terminals for detected PIDs not in the DB ──
    //    Skip Maestri: it exposes ALL child shells (across all workspaces),
    //    so creating entries eagerly would flood the DB. Maestri terminals
    //    are created only from events; detection enriches titles only (step 1).
    for (const [pid, info] of detectedByPid) {
      if (dbPidSet.has(pid)) continue;
      if (info.app === 'Maestri') continue;
      // Only create entries for confirmed claude processes
      if (!info.isClaudeProcess) continue;

      // Dedup by session_id: if this session already exists in DB, skip creation
      if (info.sessionId) {
        const existingSession = db.prepare(
          `SELECT 1 FROM terminals WHERE session_id = ? AND status != 'inactive' LIMIT 1`,
        ).get(info.sessionId);
        if (existingSession) continue;
      }

      // Dedup by PGID: if another active terminal shares the same process group, skip
      try {
        const { stdout: pgidOut } = await execFileAsync('ps', ['-o', 'pgid=', '-p', String(pid)], { encoding: 'utf-8', timeout: 2000 });
        const pgidRaw = pgidOut.trim();
        if (pgidRaw && activeDbPgids.has(pgidRaw)) continue;
      } catch { /* ps failed — process died, proceed normally */ }

      // Determine which project this terminal belongs to.
      // Try to match by window title to an existing project name.
      const title = cleanTitle(info.windowName || info.profileName || '');
      let projectId: number | undefined;
      if (projects.length > 0) {
        const matched = projects.find(p =>
          title.toLowerCase().includes(p.name.toLowerCase()),
        );
        projectId = matched?.id;
        if (!projectId) continue; // Don't guess — skip terminals without verified project match
      }
      if (!projectId) continue;

      // Do NOT pass sessionId from detector — it uses unstable indices that
      // differ from the event-supplied session IDs, causing the upsert CASE
      // logic to think it's a "new session" and wipe agent_name/display_name.
      const terminal = upsertTerminal(projectId, pid, {
        windowTitle: title || undefined,
      });
      windowTitleCache.set(pid, title);
      try { broadcast({ type: 'terminal:update', terminal, projectId }); } catch { /* ignore */ }
    }

    // ── 3. Deactivate DB terminals whose PIDs are no longer running as claude ──
    const claudePids = new Set(
      detected.filter(d => d.pid && d.isClaudeProcess).map(d => d.pid!),
    );
    for (const dbTerm of dbTerminals) {
      if (dbTerm.status === 'inactive') continue;
      if (claudePids.has(dbTerm.pid)) continue;
      // PID is either dead or no longer a claude process — deactivate
      deactivateTerminal(dbTerm.project_id, dbTerm.pid);
    }
  } catch {
    // Sync is best-effort — never crash
  }
}

// Note: intervals are managed by server.ts to ensure they run in the main process
