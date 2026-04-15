import { getAgents, getAgentInstances } from '@/lib/queries';
import { parseIntParam, apiErrorResponse, ApiError } from '@/lib/api-utils';
import { createAgentCard, listAgentCards } from '@/lib/canvas-queries';
import { broadcast } from '@/server/ws-broadcaster';
import type { AgentKind } from '@/lib/canvas-queries';

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);

    // Canvas cards: ?project=<path> (string)
    const projectPath = searchParams.get('project');
    if (projectPath) {
      const cards = listAgentCards(projectPath);
      return Response.json(cards);
    }

    // Legacy monitoring agents: ?project_id=<int>
    const projectId = parseIntParam(searchParams.get('project_id'), 'project_id');
    const expand = searchParams.get('expand') === 'terminals';
    const filters = projectId !== undefined ? { projectId } : undefined;
    const agents = expand ? getAgentInstances(filters) : getAgents(filters);
    return Response.json(agents);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

const VALID_KINDS: AgentKind[] = ['chat', 'terminal', 'hybrid'];

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as Record<string, unknown>;
    const { kind, display_name, aiox_agent, project_path, skill_path, is_chief } = body;

    if (!display_name || typeof display_name !== 'string') {
      throw new ApiError('display_name is required', 400);
    }
    if (!kind || !VALID_KINDS.includes(kind as AgentKind)) {
      throw new ApiError(`kind must be one of: ${VALID_KINDS.join(', ')}`, 400);
    }

    const card = createAgentCard({
      kind: kind as AgentKind,
      display_name: display_name.trim(),
      aiox_agent: typeof aiox_agent === 'string' ? aiox_agent : undefined,
      project_path: typeof project_path === 'string' ? project_path : undefined,
      skill_path: typeof skill_path === 'string' ? skill_path : undefined,
      is_chief: Boolean(is_chief),
    });

    broadcast({ type: 'agent.added', v: 1, card });

    return Response.json(card, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
