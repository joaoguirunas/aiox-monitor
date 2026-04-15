/**
 * POST /api/agents/:id/promote
 *
 * Promove um AgentCard de kind 'chat' para 'hybrid' (chat + PTY stub).
 * Story 9.6 / JOB-038 — integração real com Maestri vem em 9.7.
 *
 * Respostas:
 *   200 { success: true,  cardId, newKind, stubTerminalId }
 *   200 { success: false, reason: 'already_promoted' | 'card_not_found' }
 *   500 Internal error
 */

import { promoteToHybrid } from '@/server/agent-bus/promote';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const result = await promoteToHybrid(id);
    return Response.json(result);
  } catch (error) {
    console.error('[promote] error:', error);
    return Response.json(
      { error: 'Erro interno ao promover card para PTY' },
      { status: 500 },
    );
  }
}
