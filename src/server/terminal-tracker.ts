import {
  upsertTerminal,
  deactivateTerminal as dbDeactivateTerminal,
  deactivateStaleTerminals,
  getTerminalsByProject,
} from '@/lib/queries';
import { broadcast } from './ws-broadcaster';
import type { Terminal } from '@/lib/types';

export function trackTerminal(
  projectId: number,
  pid: number,
  sessionId?: string,
): Terminal {
  return upsertTerminal(projectId, pid, sessionId);
}

export function deactivateTerminal(projectId: number, pid: number): void {
  dbDeactivateTerminal(projectId, pid);
  try {
    const terminal = getTerminalsByProject(projectId).find(t => t.pid === pid);
    if (terminal) broadcast({ type: 'terminal:update', terminal, projectId });
  } catch { /* fire-and-forget */ }
}

export function cleanupStaleTerminals(): void {
  deactivateStaleTerminals(600); // 10 minutes
}

// Module-level cleanup interval — runs once per process
// Next.js in dev may restart this on hot-reload, which is acceptable
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupStaleTerminals, 60_000);
}
