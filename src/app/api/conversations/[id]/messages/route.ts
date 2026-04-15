/**
 * GET /api/conversations/:id/messages — histórico paginado
 *
 * Pagination via cursor (created_at of last seen message):
 *   ?before=<ISO_DATE>  — older messages (scroll up)
 *   ?after=<ISO_DATE>   — newer messages (load forward)
 *   ?limit=<N>          — default 50, max 200
 *
 * Returns: { messages, hasMore, conversationId }
 */

import { apiErrorResponse, ApiError } from '@/lib/api-utils';
import { getConversation, getMessages } from '@/lib/canvas-queries';

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
