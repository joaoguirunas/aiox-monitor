import { processEvent } from '@/server/event-processor';
import type { EventPayload } from '@/lib/types';

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
