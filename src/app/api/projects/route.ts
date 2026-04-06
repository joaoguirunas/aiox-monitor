import { getProjects, getProjectStats } from '@/lib/queries';
import { apiErrorResponse } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const withStats = searchParams.get('stats') === '1';

    const projects = getProjects();

    if (withStats) {
      const projectsWithStats = projects.map((p) => ({
        ...p,
        ...getProjectStats(p.id),
      }));
      return Response.json(projectsWithStats);
    }

    return Response.json(projects);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
