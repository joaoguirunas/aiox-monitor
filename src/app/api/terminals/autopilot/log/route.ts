import { getAutopilotLogs, getAutopilotStats } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') ?? '50', 10);

    const logs = getAutopilotLogs(Math.min(limit, 200));
    const stats = getAutopilotStats();

    return Response.json({ logs, stats });
  } catch {
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}
