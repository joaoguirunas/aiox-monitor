/**
 * GET /api/agents/catalog?projectPath=…
 *
 * Returns the resolved agent catalog for the given projectPath.
 * Merge strategy: project > user > builtin (§2.5.4 master plan).
 * Response is served from LRU cache when warm, or triggers a full scan (cold).
 */

import { apiErrorResponse, ApiError } from '@/lib/api-utils';
import { getCatalog } from '@/server/agent-catalog/service';

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const projectPath = searchParams.get('projectPath');

    if (!projectPath) {
      throw new ApiError('projectPath query param is required', 400);
    }

    const { agents, groups } = getCatalog(projectPath);

    return Response.json({
      projectPath,
      agents,
      groups,
      total: agents.length,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
