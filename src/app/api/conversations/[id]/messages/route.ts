/**
 * GET  /api/conversations/:id/messages — histórico paginado
 * POST /api/conversations/:id/messages — enviar mensagem + dispatch via AgentBus
 *
 * POST body:
 *   { content: string, sender_id?: string, sender_role?: SenderRole, target_card_id: string }
 *
 * Dispatch flow:
 *   1. Persists sender message
 *   2. Validates authorization (directed connection)
 *   3. Applies depth guard
 *   4. Injects context via buildAgentContext
 *   5. Dispatches to card (terminal → maestri ask, chat → stub)
 *   6. Broadcasts WS chat.chunk + message.new
 */

import { apiErrorResponse, ApiError } from '@/lib/api-utils';
import { getConversation, getMessages } from '@/lib/canvas-queries';
import { dispatch } from '@/server/agent-bus/dispatcher';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;

    const conversation = getConversation(id);
    if (!conversation) throw new ApiError('Conversation not found', 404);

    const { searchParams } = new URL(request.url);
    const limitRaw = parseInt(searchParams.get('limit') ?? '50', 10);
    const limit = isNaN(limitRaw) ? 50 : Math.max(1, Math.min(limitRaw, 200));
    const before = searchParams.get('before') ?? undefined;
    const after = searchParams.get('after') ?? undefined;

    const { messages, hasMore } = getMessages(id, { limit, before, after });

    return Response.json({ conversationId: id, messages, hasMore, total: messages.length });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id: conversationId } = await params;

    const conversation = getConversation(conversationId);
    if (!conversation) throw new ApiError('Conversation not found', 404);

    const body = await request.json() as Record<string, unknown>;
    const { content, sender_id, sender_role, target_card_id } = body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      throw new ApiError('content is required', 400);
    }
    if (!target_card_id || typeof target_card_id !== 'string') {
      throw new ApiError('target_card_id is required', 400);
    }

    const validRoles = ['chief', 'agent', 'system', 'tool'] as const;
    type SenderRole = typeof validRoles[number];
    const role: SenderRole =
      validRoles.includes(sender_role as SenderRole)
        ? (sender_role as SenderRole)
        : 'agent';

    const outcome = await dispatch({
      targetCardId: target_card_id,
      conversationId,
      content: content.trim(),
      senderId: typeof sender_id === 'string' ? sender_id : 'user',
      senderRole: role,
    });

    if (!outcome.ok) {
      const statusMap: Record<string, number> = {
        unauthorized: 403,
        depth_exceeded: 429,
        card_not_found: 404,
        no_terminal_name: 422,
        dispatch_error: 502,
      };
      const status = statusMap[outcome.reason] ?? 400;
      return Response.json(
        { success: false, reason: outcome.reason, detail: outcome.detail },
        { status },
      );
    }

    return Response.json(
      {
        success: true,
        messageId: outcome.messageId,
        responseId: outcome.responseId,
        conversationId,
      },
      { status: 201 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
