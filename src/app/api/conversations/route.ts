/**
 * POST /api/conversations — criar conversa manualmente
 * Body: { kind, title?, participant_ids? }
 *
 * Normally conversations are auto-created by POST /api/connections.
 * This endpoint allows explicit creation (e.g. group chats, broadcast channels).
 */

import { apiErrorResponse, ApiError } from '@/lib/api-utils';
import { createConversation } from '@/lib/canvas-queries';
import type { ConversationKind } from '@/lib/canvas-queries';

const VALID_KINDS: ConversationKind[] = ['peer', 'group', 'broadcast', 'chief-thread'];

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as Record<string, unknown>;
    const { kind, title, participant_ids } = body;

    if (!kind || !VALID_KINDS.includes(kind as ConversationKind)) {
      throw new ApiError(`kind must be one of: ${VALID_KINDS.join(', ')}`, 400);
    }

    const participants = Array.isArray(participant_ids)
      ? participant_ids.filter((x): x is string => typeof x === 'string')
      : [];

    const conversation = createConversation({
      kind: kind as ConversationKind,
      title: typeof title === 'string' ? title.trim() || undefined : undefined,
      participant_ids: participants,
    });

    return Response.json(conversation, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
