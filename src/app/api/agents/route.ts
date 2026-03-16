import { getAgents, getAgentInstances } from '@/lib/queries';
import { parseIntParam, apiErrorResponse } from '@/lib/api-utils';

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = parseIntParam(searchParams.get('project_id'), 'project_id');
    const expand = searchParams.get('expand') === 'terminals';

    const filters = projectId !== undefined ? { projectId } : undefined;
    const agents = expand ? getAgentInstances(filters) : getAgents(filters);
    return Response.json(agents);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
