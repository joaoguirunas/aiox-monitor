import { ProcessManager } from '@/server/command-room/process-manager';

export const dynamic = 'force-dynamic';

// DELETE /api/command-room/kill?project=<path>   → kill all for that project
// DELETE /api/command-room/kill?all=true          → kill every process
export async function DELETE(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const project = url.searchParams.get('project');
  const all = url.searchParams.get('all');

  const pm = ProcessManager.getInstance();

  if (all === 'true') {
    pm.killAll();
    return Response.json({ ok: true, message: 'All processes killed' });
  }

  if (project) {
    const killed = pm.killByProject(project);
    return Response.json({ ok: true, killed, project });
  }

  return Response.json({ error: 'Provide ?project=<path> or ?all=true' }, { status: 400 });
}

// GET /api/command-room/kill → list active processes (for debugging)
export async function GET(): Promise<Response> {
  const pm = ProcessManager.getInstance();
  const list = pm.list();
  const active = list.filter((p) => p.status !== 'closed');
  return Response.json({ total: list.length, active: active.length, processes: list });
}
