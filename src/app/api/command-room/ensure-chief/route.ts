import { existsSync, statSync } from 'node:fs';
import { ProcessManager } from '@/server/command-room/process-manager';
import { insertTerminal } from '@/lib/command-room-repository';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// In-memory lock to prevent concurrent Chief creation for the same project
const pendingProjects = new Set<string>();

/**
 * POST /api/command-room/ensure-chief
 * Ensures a Chief terminal exists for the given project.
 * If one already exists (active or idle), returns it.
 * If not, spawns a new Chief terminal automatically.
 *
 * Uses an in-memory lock to prevent race conditions where two
 * concurrent requests both pass the DB check before either inserts.
 */
export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { projectPath } = body as { projectPath?: string };

  if (!projectPath || typeof projectPath !== 'string') {
    return Response.json(
      { error: 'projectPath is required' },
      { status: 400 },
    );
  }

  if (!existsSync(projectPath) || !statSync(projectPath).isDirectory()) {
    return Response.json(
      { error: `projectPath is not a valid directory: ${projectPath}` },
      { status: 400 },
    );
  }

  // Prevent concurrent Chief creation for the same project
  if (pendingProjects.has(projectPath)) {
    // Another request is already creating a Chief — wait briefly and check DB
    await new Promise((r) => setTimeout(r, 500));
    try {
      const existing = db.prepare(`
        SELECT id, agent_name, pty_status
        FROM command_room_terminals
        WHERE project_path = ? AND is_chief = 1 AND pty_status IN ('active', 'idle')
        LIMIT 1
      `).get(projectPath) as { id: string; agent_name: string; pty_status: string } | undefined;

      if (existing) {
        return Response.json({
          created: false,
          terminal: {
            id: existing.id,
            agentName: existing.agent_name,
            is_chief: true,
            status: existing.pty_status,
          },
        });
      }
    } catch { /* fall through to create */ }
  }

  // Check if a Chief already exists for this project (active or idle)
  try {
    const existing = db.prepare(`
      SELECT id, agent_name, pty_status
      FROM command_room_terminals
      WHERE project_path = ? AND is_chief = 1 AND pty_status IN ('active', 'idle')
      LIMIT 1
    `).get(projectPath) as { id: string; agent_name: string; pty_status: string } | undefined;

    if (existing) {
      return Response.json({
        created: false,
        terminal: {
          id: existing.id,
          agentName: existing.agent_name,
          is_chief: true,
          status: existing.pty_status,
        },
      });
    }
  } catch { /* table may not exist yet, proceed to create */ }

  // Acquire lock
  pendingProjects.add(projectPath);

  // No Chief exists — spawn one
  const pm = ProcessManager.getInstance();

  try {
    const proc = pm.spawn({
      agentName: 'CHIEF',
      projectPath,
      initialPrompt: 'claude --dangerously-skip-permissions',
    });

    try {
      insertTerminal(
        proc.id,
        'CHIEF',
        'Chief',
        projectPath,
        proc.cols,
        proc.rows,
        null,   // no category for Chief
        null,   // no description
        true,   // is_chief = true
      );
    } catch (dbErr) {
      console.error('[ensure-chief] Failed to persist Chief to DB:', dbErr);
    }

    return Response.json({
      created: true,
      terminal: {
        id: proc.id,
        agentName: 'CHIEF',
        pid: proc.pid,
        status: proc.status,
        wsUrl: `/pty?id=${proc.id}`,
        createdAt: proc.createdAt,
        is_chief: true,
      },
    }, { status: 201 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to spawn Chief' },
      { status: 500 },
    );
  } finally {
    pendingProjects.delete(projectPath);
  }
}
