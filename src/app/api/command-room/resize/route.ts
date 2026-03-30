import { ProcessManager } from '@/server/command-room/process-manager';
import { updateTerminalDimensions } from '@/lib/command-room-repository';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { id, cols, rows } = body as { id?: string; cols?: number; rows?: number };

  if (!id || typeof id !== 'string') {
    return Response.json({ error: 'id is required' }, { status: 400 });
  }
  if (typeof cols !== 'number' || cols < 1 || cols > 500 || !Number.isInteger(cols)) {
    return Response.json({ error: 'cols must be an integer between 1 and 500' }, { status: 400 });
  }
  if (typeof rows !== 'number' || rows < 1 || rows > 500 || !Number.isInteger(rows)) {
    return Response.json({ error: 'rows must be an integer between 1 and 500' }, { status: 400 });
  }

  const pm = ProcessManager.getInstance();
  pm.resize(id, cols, rows);

  try {
    updateTerminalDimensions(id, cols, rows);
  } catch (dbErr) {
    console.error('[resize] Failed to update dimensions in DB:', dbErr);
  }

  return Response.json({ ok: true, id, cols, rows });
}
