import { processEvent } from '@/server/event-processor';
import { getEvents } from '@/lib/queries';
import { parseIntParam, apiErrorResponse } from '@/lib/api-utils';
import type { EventPayload, EventFilters, EventType } from '@/lib/types';

const VALID_TYPES = new Set<EventType>([
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'Stop',
  'SubagentStop',
]);

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);

    const projectId = parseIntParam(searchParams.get('project_id'), 'project_id');
    const agentId = parseIntParam(searchParams.get('agent_id'), 'agent_id');
    const terminalId = parseIntParam(searchParams.get('terminal_id'), 'terminal_id');
    const limit = parseIntParam(searchParams.get('limit'), 'limit');
    const offset = parseIntParam(searchParams.get('offset'), 'offset');

    const typeParam = searchParams.get('type');
    if (typeParam && !VALID_TYPES.has(typeParam as EventType)) {
      return Response.json(
        { success: false, error: `Invalid type: must be one of ${[...VALID_TYPES].join(', ')}` },
        { status: 400 },
      );
    }

    const filters: EventFilters = {
      projectId,
      agentId,
      terminalId,
      type: typeParam ? (typeParam as EventType) : undefined,
      since: searchParams.get('since') ?? undefined,
      limit,
      offset,
    };

    const result = getEvents(filters);
    return Response.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  let payload: Partial<EventPayload>;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  if (!payload.project_path || !payload.hook_type) {
    return Response.json(
      { success: false, error: 'Missing required fields: project_path, hook_type' },
      { status: 400 },
    );
  }

  try {
    const result = processEvent(payload as EventPayload);
    return Response.json({ success: true, event_id: result.id });
  } catch (error) {
    // Always 200 — never block the Python hook
    return Response.json({ success: false, error: String(error) });
  }
}
