/**
 * POST /api/projects/close
 * Body: { projectPath: string }
 *
 * Closes a project:
 * 1. Stops fs.watch watcher for the project
 * 2. Removes from open_projects table
 * 3. Broadcasts WS: project.closed
 */

import { apiErrorResponse, ApiError } from '@/lib/api-utils';
import { closeProject } from '@/server/agent-catalog/service';

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { projectPath?: string };
    const projectPath = body?.projectPath?.trim();

    if (!projectPath) {
      throw new ApiError('projectPath is required', 400);
    }

    closeProject(projectPath);

    return Response.json({ success: true, projectPath });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
