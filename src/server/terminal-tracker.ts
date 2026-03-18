import {
  upsertTerminal,
  deactivateTerminal as dbDeactivateTerminal,
  deactivateStaleTerminals,
  markTerminalsActive,
  getTerminalsByProject,
  getAllTerminals,
  updateTerminalWindowTitle,
  setTerminalActive,
  getProjects,
  purgeOldInactiveTerminals,
} from '../lib/queries';
import { broadcast } from './ws-broadcaster';
import { detectSystemTerminals } from './terminal-detector';
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
  },
): Terminal {
  const cachedTitle = windowTitleCache.get(pid);
  const enrichedOpts = { ...opts, windowTitle: cachedTitle };
  const terminal = upsertTerminal(projectId, pid, enrichedOpts);

  // Trigger async detection if no cached title — update DB + broadcast when found
  if (!cachedTitle) {
    detectWindowTitle(pid).then(title => {
      if (title) {
        const updated = upsertTerminal(projectId, pid, { windowTitle: title });
        try { broadcast({ type: 'terminal:update', terminal: updated, projectId }); } catch { /* ignore */ }
      }
    }).catch(() => { /* ignore */ });
  }

  return terminal;
}

export function deactivateTerminal(projectId: number, pid: number): void {
  dbDeactivateTerminal(projectId, pid);
  windowTitleCache.delete(pid);
  try {
    const terminal = getTerminalsByProject(projectId).find(t => t.pid === pid);
    if (terminal) broadcast({ type: 'terminal:update', terminal, projectId });
  } catch { /* fire-and-forget */ }
}

export function cleanupStaleTerminals(): void {
  markTerminalsActive(300);       // processing > 5min without event → active (idle)
  deactivateStaleTerminals(900);  // no activity for 15min → inactive
  purgeOldInactiveTerminals(3600); // delete inactive > 1h + deduplicate PIDs
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

    // Build a set of PIDs already in the DB
    const dbPidSet = new Set(dbTerminals.map(t => t.pid));

    // ── 1. Update existing terminals: match by PID, update title + reactivate ──
    for (const dbTerm of dbTerminals) {
      const match = detectedByPid.get(dbTerm.pid);
      if (!match) continue;

      const title = cleanTitle(match.windowName || match.profileName || '');
      let changed = false;

      if (title && title !== dbTerm.window_title) {
        updateTerminalWindowTitle(dbTerm.id, title);
        windowTitleCache.set(dbTerm.pid, title);
        changed = true;
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

    // ── 2. Create NEW terminals for detected PIDs not in the DB ──
    for (const [pid, info] of detectedByPid) {
      if (dbPidSet.has(pid)) continue;
      // Only create entries for confirmed claude processes
      if (!info.isClaudeProcess) continue;

      // Determine which project this terminal belongs to.
      // Try to match by window title to an existing project name, else use first project.
      const title = cleanTitle(info.windowName || info.profileName || '');
      let projectId: number | undefined;
      if (projects.length > 0) {
        // Try matching by project name in window title
        const matched = projects.find(p =>
          title.toLowerCase().includes(p.name.toLowerCase()),
        );
        projectId = matched?.id ?? projects[0].id;
      }
      if (!projectId) continue;

      const terminal = upsertTerminal(projectId, pid, {
        sessionId: info.sessionId,
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
