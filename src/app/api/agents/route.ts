import { getAgents, getAgentInstances, updateAgentFields } from '@/lib/queries';
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

export async function PATCH(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const { id, role, team, display_name } = body as {
      id?: number;
      role?: string;
      team?: string;
      display_name?: string;
    };

    if (!id || typeof id !== 'number') {
      return Response.json({ error: 'id is required and must be a number' }, { status: 400 });
    }

    const fields: { display_name?: string; role?: string; team?: string } = {};
    if (role !== undefined) fields.role = role;
    if (team !== undefined) fields.team = team;
    if (display_name !== undefined) fields.display_name = display_name;

    if (Object.keys(fields).length === 0) {
      return Response.json({ error: 'No fields to update' }, { status: 400 });
    }

    updateAgentFields(id, fields);
    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
