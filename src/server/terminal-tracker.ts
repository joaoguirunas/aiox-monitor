import {
  upsertTerminal,
  deactivateTerminal,
  deactivateStaleTerminals,
} from '@/lib/queries';
import type { Terminal } from '@/lib/types';

export function trackTerminal(
  projectId: number,
  pid: number,
  sessionId?: string,
): Terminal {
  return upsertTerminal(projectId, pid, sessionId);
}

export { deactivateTerminal };

export function cleanupStaleTerminals(): void {
  deactivateStaleTerminals(600); // 10 minutes
}

// Module-level cleanup interval — runs once per process
// Next.js in dev may restart this on hot-reload, which is acceptable
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupStaleTerminals, 60_000);
}
