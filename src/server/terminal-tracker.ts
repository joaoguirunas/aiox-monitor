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
  markTerminalsActive(30);        // processing > 30s without event → active
  deactivateStaleTerminals(600);  // no activity for 10min → inactive
}

/**
 * Proactive sync: detect all system terminals (iTerm2 + Terminal.app)
 * and update the DB with window titles + reactivate terminals that are still alive.
 */
export async function syncSystemTerminals(): Promise<void> {
  try {
    const detected = await detectSystemTerminals();
    if (detected.length === 0) return;

    const dbTerminals = getAllTerminals();
    const projects = getProjects();

    // Build a PID → detected info map
    const detectedByPid = new Map(
      detected.filter(d => d.pid).map(d => [d.pid!, d]),
    );

    // Update existing terminals: match by PID, update title + reactivate if alive
    for (const dbTerm of dbTerminals) {
      const match = detectedByPid.get(dbTerm.pid);
      if (!match) continue;

      const title = cleanTitle(match.windowName || match.profileName || '');
      let changed = false;

      // Update window_title if different or missing
      if (title && title !== dbTerm.window_title) {
        updateTerminalWindowTitle(dbTerm.id, title);
        windowTitleCache.set(dbTerm.pid, title);
        changed = true;
      }

      // Reactivate if terminal is inactive but process is still alive
      if (dbTerm.status === 'inactive') {
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

    // Deactivate DB terminals whose PIDs are no longer detected as running
    const detectedPids = new Set(detected.filter(d => d.pid).map(d => d.pid!));
    for (const dbTerm of dbTerminals) {
      if (dbTerm.status === 'inactive') continue;
      if (detectedPids.has(dbTerm.pid)) continue;
      // PID no longer exists — deactivate
      deactivateTerminal(dbTerm.project_id, dbTerm.pid);
    }
  } catch {
    // Sync is best-effort — never crash
  }
}

// Note: intervals are managed by server.ts to ensure they run in the main process
