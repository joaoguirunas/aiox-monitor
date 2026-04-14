/**
 * POST /api/projects/open
 * Body: { projectPath: string }
 *
 * Registers a project as open:
 * 1. Scans catalog (project + user scopes, merge by priority)
 * 2. Persists to agent_catalog / agent_groups in SQLite
 * 3. Sets up fs.watch for live reloads
 * 4. Broadcasts WS: project.opened + catalog.reloaded
 *
 * Returns the initial catalog for the project.
 */

import { apiErrorResponse, ApiError } from '@/lib/api-utils';
import { openProject } from '@/server/agent-catalog/service';

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { projectPath?: string };
    const projectPath = body?.projectPath?.trim();

    if (!projectPath) {
      throw new ApiError('projectPath is required', 400);
    }

    const { agents, groups } = openProject(projectPath);

    return Response.json({
      success: true,
      projectPath,
      catalog: { agents, groups, total: agents.length },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
