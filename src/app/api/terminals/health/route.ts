import { getTerminalHealth } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const health = getTerminalHealth();
  return Response.json(health);
}
