import { db } from '@/lib/db';

export function cleanupOldEvents(retentionDays: number = 30): { events: number; sessions: number } {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  const eventsResult = db.prepare('DELETE FROM events WHERE created_at < ?').run(cutoff);
  const sessionsResult = db.prepare(
    "DELETE FROM sessions WHERE ended_at IS NOT NULL AND ended_at < ?"
  ).run(cutoff);

  const events = Number(eventsResult.changes);
  const sessions = Number(sessionsResult.changes);

  if (events > 0 || sessions > 0) {
    console.log(`[cleanup] Removed ${events} events and ${sessions} sessions older than ${retentionDays} days`);
  }

  return { events, sessions };
}

export function markStaleSessions(): number {
  const result = db.prepare(`
    UPDATE sessions SET status = 'interrupted'
    WHERE status = 'active'
    AND id NOT IN (
      SELECT DISTINCT session_id FROM events
      WHERE created_at > datetime('now', '-1 hour')
      AND session_id IS NOT NULL
    )
  `).run();

  const count = Number(result.changes);
  if (count > 0) {
    console.log(`[cleanup] Marked ${count} stale sessions as interrupted`);
  }
  return count;
}
