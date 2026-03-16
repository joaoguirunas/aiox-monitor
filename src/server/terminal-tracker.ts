import {
  upsertTerminal,
  deactivateTerminal as dbDeactivateTerminal,
  deactivateStaleTerminals,
  markTerminalsActive,
  getTerminalsByProject,
} from '../lib/queries';
import { broadcast } from './ws-broadcaster';
import type { Terminal } from '../lib/types';

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
  return upsertTerminal(projectId, pid, opts);
}

export function deactivateTerminal(projectId: number, pid: number): void {
  dbDeactivateTerminal(projectId, pid);
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
