import { ProcessManager } from '@/server/command-room/process-manager';
import { MAX_PROCESSES } from '@/server/command-room/types';
import { listActiveTerminals, listCategories } from '@/lib/command-room-repository';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const pm = ProcessManager.getInstance();
  const pmMap = new Map(pm.list().map((t) => [t.id, t]));

  const dbRows = listActiveTerminals();
  const categories = listCategories();
  const categoryMap = new Map(categories.map(cat => [cat.id, cat]));

  // Merge: DB is source of truth for persistence; ProcessManager overrides runtime fields
  const terminals = dbRows.map((row) => {
    const runtime = pmMap.get(row.id);
    const category = row.category_id ? categoryMap.get(row.category_id) : null;

    return {
      id: row.id,
      agentName: row.agent_name,
      agentDisplayName: row.agent_display_name ?? null,
      projectPath: row.project_path,
      cols: runtime?.cols ?? row.cols,
      rows: runtime?.rows ?? row.rows,
      pty_status: row.pty_status,
      // Runtime fields (only available if process is alive in PM)
      pid: runtime?.pid ?? null,
      status: runtime?.status ?? row.pty_status,
      createdAt: runtime?.createdAt ?? row.created_at,
      // Category-related fields
      category_id: row.category_id,
      category: category ? {
        id: category.id,
        name: category.name,
        color: category.color,
      } : null,
      description: row.description,
      is_chief: row.is_chief === 1,
    };
  });

  return Response.json({
    terminals,
    categories,
    count: terminals.length,
    maxTerminals: MAX_PROCESSES,
  });
}
