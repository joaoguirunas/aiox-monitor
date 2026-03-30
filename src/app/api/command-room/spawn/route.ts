import { existsSync, statSync } from 'node:fs';
import { ProcessManager } from '@/server/command-room/process-manager';
import { MAX_PROCESSES } from '@/server/command-room/types';
import { insertTerminal } from '@/lib/command-room-repository';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { agentName, agentDisplayName, projectPath, cols, rows, initialPrompt, aiox_agent, category_id, description, is_chief } = body as {
    agentName?: string;
    agentDisplayName?: string;
    projectPath?: string;
    cols?: number;
    rows?: number;
    initialPrompt?: string;
    aiox_agent?: string;
    category_id?: string;
    description?: string;
    is_chief?: boolean;
  };

  // ── Validate agentName ──────────────────────────────────────────────────
  if (!agentName || typeof agentName !== 'string' || agentName.trim().length === 0) {
    return Response.json(
      { error: 'agentName is required and must be a non-empty string' },
      { status: 400 },
    );
  }

  // ── Resolve projectPath (fallback to server CWD) ───────────────────────
  const resolvedPath = (typeof projectPath === 'string' && projectPath) ? projectPath : process.cwd();

  if (!existsSync(resolvedPath)) {
    return Response.json(
      { error: `projectPath does not exist: ${resolvedPath}` },
      { status: 400 },
    );
  }
  const stat = statSync(resolvedPath);
  if (!stat.isDirectory()) {
    return Response.json(
      { error: `projectPath is not a directory: ${resolvedPath}` },
      { status: 400 },
    );
  }

  // ── Validate optional cols/rows ─────────────────────────────────────────
  if (cols !== undefined && (typeof cols !== 'number' || cols < 1 || cols > 500 || !Number.isInteger(cols))) {
    return Response.json(
      { error: 'cols must be an integer between 1 and 500' },
      { status: 400 },
    );
  }
  if (rows !== undefined && (typeof rows !== 'number' || rows < 1 || rows > 500 || !Number.isInteger(rows))) {
    return Response.json(
      { error: 'rows must be an integer between 1 and 500' },
      { status: 400 },
    );
  }

  // ── Spawn ───────────────────────────────────────────────────────────────
  const pm = ProcessManager.getInstance();

  try {
    const proc = pm.spawn({
      agentName,
      projectPath: resolvedPath,
      cols,
      rows,
      initialPrompt: typeof initialPrompt === 'string' ? initialPrompt : undefined,
      aiox_agent: typeof aiox_agent === 'string' ? aiox_agent : undefined,
    });

    try {
      insertTerminal(
        proc.id,
        proc.agentName,
        typeof agentDisplayName === 'string' ? agentDisplayName : null,
        resolvedPath,
        proc.cols,
        proc.rows,
        typeof category_id === 'string' ? category_id : null,
        typeof description === 'string' ? description : null,
        typeof is_chief === 'boolean' ? is_chief : false,
      );
    } catch (dbErr) {
      console.error('[spawn] Failed to persist terminal to DB:', dbErr);
    }

    return Response.json(
      {
        id: proc.id,
        agentName: proc.agentName,
        pid: proc.pid,
        status: proc.status,
        wsUrl: `/pty?id=${proc.id}`,
        createdAt: proc.createdAt,
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('Process limit reached')) {
      return Response.json(
        { error: message, maxTerminals: MAX_PROCESSES },
        { status: 503 },
      );
    }

    return Response.json({ error: message }, { status: 500 });
  }
}
