import { db } from '@/lib/db';
import { getAllTerminals, getAutopilotStats } from '@/lib/queries';
import { broadcast } from '@/server/ws-broadcaster';

export const dynamic = 'force-dynamic';

/** GET — autopilot status summary + stats */
export async function GET(): Promise<Response> {
  const terminals = getAllTerminals().filter(t => t.status !== 'inactive');
  const on = terminals.filter(t => t.autopilot === 1);
  const off = terminals.filter(t => t.autopilot === 0);
  const waiting = terminals.filter(t => t.autopilot === 1 && t.waiting_permission === 1);
  const stats = getAutopilotStats();

  return Response.json({
    total: terminals.length,
    on: on.length,
    off: off.length,
    waiting: waiting.length,
    stats,
    terminals: terminals.map(t => ({
      id: t.id,
      pid: t.pid,
      window_title: t.window_title,
      autopilot: t.autopilot,
      waiting_permission: t.waiting_permission,
      status: t.status,
    })),
  });
}

/** PATCH — set autopilot for all active terminals */
export async function PATCH(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { enabled?: boolean };
    if (typeof body.enabled !== 'boolean') {
      return Response.json({ error: 'Missing "enabled" boolean field' }, { status: 400 });
    }

    const value = body.enabled ? 1 : 0;
    db.prepare(`UPDATE terminals SET autopilot = ? WHERE status != 'inactive'`).run(value);

    const updated = getAllTerminals().filter(t => t.status !== 'inactive');
    for (const terminal of updated) {
      try {
        broadcast({ type: 'terminal:update', terminal, projectId: terminal.project_id });
      } catch { /* best-effort */ }
    }

    return Response.json({
      updated: updated.length,
      autopilot: body.enabled,
    });
  } catch {
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}
