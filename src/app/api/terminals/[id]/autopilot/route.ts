import { setTerminalAutopilot } from '@/lib/queries';
import { broadcast } from '@/server/ws-broadcaster';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return Response.json({ error: 'Invalid terminal id' }, { status: 400 });
    }

    const body = await request.json() as { enabled?: boolean };
    if (typeof body.enabled !== 'boolean') {
      return Response.json({ error: 'Missing "enabled" boolean field' }, { status: 400 });
    }

    const terminal = setTerminalAutopilot(id, body.enabled);
    if (!terminal) {
      return Response.json({ error: 'Terminal not found' }, { status: 404 });
    }

    try {
      broadcast({ type: 'terminal:update', terminal, projectId: terminal.project_id });
    } catch { /* best-effort */ }

    return Response.json({ terminal });
  } catch {
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}
