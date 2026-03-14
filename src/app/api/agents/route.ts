import { getAgents } from '@/lib/queries';
import { parseIntParam, apiErrorResponse } from '@/lib/api-utils';

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = parseIntParam(searchParams.get('project_id'), 'project_id');

    const agents = getAgents(projectId !== undefined ? { projectId } : undefined);
    return Response.json(agents);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
