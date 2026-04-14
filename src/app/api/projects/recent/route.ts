/**
 * GET /api/projects/recent?limit=N
 *
 * Returns recently opened projects (MRU — most recently opened first).
 * Sourced from open_projects table, ordered by opened_at DESC.
 * Default limit: 20.
 */

import { apiErrorResponse } from '@/lib/api-utils';
import { getOpenProjects } from '@/server/agent-catalog/service';

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const limitRaw = parseInt(searchParams.get('limit') ?? '20', 10);
    const limit = isNaN(limitRaw) || limitRaw < 1 ? 20 : Math.min(limitRaw, 100);

    const all = getOpenProjects();
    const projects = all.slice(0, limit);

    return Response.json({ projects, total: all.length });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
