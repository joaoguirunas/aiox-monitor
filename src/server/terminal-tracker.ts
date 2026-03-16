import {
  upsertTerminal,
  deactivateTerminal as dbDeactivateTerminal,
  deactivateStaleTerminals,
  markTerminalsActive,
  getTerminalsByProject,
} from '../lib/queries';
import { broadcast } from './ws-broadcaster';
import { detectSystemTerminals } from './terminal-detector';
import type { Terminal } from '../lib/types';

// Cache window titles by PID — detected once, reused across events
const windowTitleCache = new Map<number, string>();
let lastDetectionTime = 0;
let cachedDetectionResult: Awaited<ReturnType<typeof detectSystemTerminals>> = [];

async function detectWindowTitle(pid: number): Promise<string | undefined> {
  // Check cache first
  if (windowTitleCache.has(pid)) return windowTitleCache.get(pid);

  // Rate-limit detection to once per 10 seconds (osascript is expensive)
  const now = Date.now();
  if (now - lastDetectionTime > 10_000) {
    try {
      cachedDetectionResult = await detectSystemTerminals();
      lastDetectionTime = now;
    } catch {
      // Detection failed — return undefined
      return undefined;
    }
  }

  // Find the terminal session matching this PID
  const match = cachedDetectionResult.find(t => t.pid === pid);
  if (match) {
    const title = match.windowName || `${match.app} — Tab ${match.tabIndex + 1}`;
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
  // Try to enrich with window title (async, best-effort)
  // Use cached value if available, otherwise trigger async detection
  const cachedTitle = windowTitleCache.get(pid);
  const enrichedOpts = { ...opts, windowTitle: cachedTitle };
  const terminal = upsertTerminal(projectId, pid, enrichedOpts);

  // Trigger async detection for next time if no cached title
  if (!cachedTitle) {
    detectWindowTitle(pid).then(title => {
      if (title) {
        // Update the terminal with the detected window title
        upsertTerminal(projectId, pid, { windowTitle: title });
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
  deactivateStaleTerminals(7200); // no activity for 2h → inactive
}

// Module-level cleanup interval — runs once per process
// Reduced to 15s for responsive processing→active transition
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupStaleTerminals, 15_000);
}
