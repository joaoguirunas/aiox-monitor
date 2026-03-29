import { ProcessManager } from '@/server/command-room/process-manager';
import { MAX_PROCESSES } from '@/server/command-room/types';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const pm = ProcessManager.getInstance();
  const terminals = pm.list();

  return Response.json({
    terminals,
    count: terminals.length,
    maxTerminals: MAX_PROCESSES,
  });
}
