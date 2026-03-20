import { getSessions } from '@/lib/queries';
import { parseIntParam, apiErrorResponse } from '@/lib/api-utils';
import type { SessionFilters } from '@/lib/types';

const VALID_STATUSES = new Set(['active', 'completed', 'interrupted']);

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);

    const projectId = parseIntParam(searchParams.get('project_id'), 'project_id');
    const agentId = parseIntParam(searchParams.get('agent_id'), 'agent_id');
    const terminalId = parseIntParam(searchParams.get('terminal_id'), 'terminal_id');
    const limit = parseIntParam(searchParams.get('limit'), 'limit');
    const offset = parseIntParam(searchParams.get('offset'), 'offset');

    const statusParam = searchParams.get('status');
    if (statusParam && !VALID_STATUSES.has(statusParam)) {
      return Response.json(
        { success: false, error: `Invalid status: must be one of ${[...VALID_STATUSES].join(', ')}` },
        { status: 400 },
      );
    }

    const filters: SessionFilters = {
      projectId,
      agentId,
      terminalId,
      status: statusParam ? (statusParam as SessionFilters['status']) : undefined,
      since: searchParams.get('since') ?? undefined,
      until: searchParams.get('until') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      limit,
      offset,
    };

    const result = getSessions(filters);
    return Response.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
