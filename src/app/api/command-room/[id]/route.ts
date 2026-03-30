import { ProcessManager } from '@/server/command-room/process-manager';
import { updateTerminalStatus } from '@/lib/command-room-repository';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const pm = ProcessManager.getInstance();
  const proc = pm.get(id);

  if (!proc) {
    return Response.json({ error: 'Terminal not found' }, { status: 404 });
  }

  return Response.json({
    id: proc.id,
    agentName: proc.agentName,
    projectPath: proc.projectPath,
    pid: proc.pid,
    status: proc.status,
    cols: proc.cols,
    rows: proc.rows,
    createdAt: proc.createdAt,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  let body: { data?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { data } = body;
  if (typeof data !== 'string' || data.length === 0) {
    return Response.json({ error: 'data is required and must be a non-empty string' }, { status: 400 });
  }
  if (data.length > 4096) {
    return Response.json({ error: 'data exceeds maximum length of 4096 bytes' }, { status: 400 });
  }

  const pm = ProcessManager.getInstance();
  // Debug: log exact bytes being sent
  console.log('[API POST] Sending to PTY:', JSON.stringify(data), 'bytes:', Buffer.from(data).toString('hex'));
  const written = pm.write(id, data);

  if (!written) {
    return Response.json({ error: 'Terminal not found or not writable' }, { status: 404 });
  }

  return Response.json({ ok: true, id, bytes: data.length });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const pm = ProcessManager.getInstance();
  const killed = pm.kill(id);

  if (!killed) {
    return Response.json({ error: 'Terminal not found' }, { status: 404 });
  }

  try { updateTerminalStatus(id, 'closed'); } catch { /* ignore */ }

  return Response.json({ id, killed: true });
}
