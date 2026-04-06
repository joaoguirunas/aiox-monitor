import { ProcessManager } from '@/server/command-room/process-manager';
import { ChatMessageStore } from '@/server/command-room/chat-store';
import { updateTerminalStatus, updateTerminalLinks } from '@/lib/command-room-repository';

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

  const { data, submit } = body as { data?: string; submit?: boolean };
  if (typeof data !== 'string' || data.length === 0) {
    return Response.json({ error: 'data is required and must be a non-empty string' }, { status: 400 });
  }
  if (data.length > 4096) {
    return Response.json({ error: 'data exceeds maximum length of 4096 bytes' }, { status: 400 });
  }

  // Auto-submit by default: append \r (carriage return) like xterm.js Enter key
  // PTY/Claude Code CLI expects \r for Enter, not \n
  const payload = submit !== false && !data.endsWith('\r') && !data.endsWith('\n') ? data + '\r' : data;

  const pm = ProcessManager.getInstance();
  const written = pm.write(id, payload);

  if (!written) {
    return Response.json({ error: 'Terminal not found or not writable' }, { status: 404 });
  }

  // Record as chief chat message (strip trailing \r or \n for clean display)
  const chatStore = ChatMessageStore.getInstance();
  const cleanContent = data.replace(/[\r\n]+$/, '');
  if (cleanContent.length > 0) {
    chatStore.addChiefMessage(id, cleanContent);
  }

  return Response.json({ ok: true, id, bytes: payload.length });
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { linked_terminal_ids } = body as { linked_terminal_ids?: string[] };

  if (linked_terminal_ids !== undefined) {
    if (!Array.isArray(linked_terminal_ids) || !linked_terminal_ids.every((x) => typeof x === 'string')) {
      return Response.json({ error: 'linked_terminal_ids must be an array of strings' }, { status: 400 });
    }
    try {
      updateTerminalLinks(id, linked_terminal_ids);
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : 'Failed to update links' }, { status: 500 });
    }
  }

  return Response.json({ ok: true, id });
}
