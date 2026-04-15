/**
 * POST /api/connections — criar aresta entre dois agent_cards
 * Body: { source_id, target_id, kind?, directed?, label? }
 *
 * Validates:
 * - Both cards exist
 * - UNIQUE(source_id, target_id, kind) — 409 on duplicate
 * - Auto-creates a conversation for the connection
 */

import { apiErrorResponse, ApiError } from '@/lib/api-utils';
import { getAgentCard, createConnection, createConversation } from '@/lib/canvas-queries';
import { broadcast } from '@/server/ws-broadcaster';
import type { ConnectionKind, ConversationKind } from '@/lib/canvas-queries';

const VALID_KINDS: ConnectionKind[] = ['chat', 'broadcast', 'supervise', 'context-share'];

function conversationKindFor(connKind: ConnectionKind): ConversationKind {
  if (connKind === 'broadcast') return 'broadcast';
  if (connKind === 'supervise') return 'chief-thread';
  return 'peer';
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as Record<string, unknown>;
    const { source_id, target_id, kind = 'chat', directed = true, label } = body;

    if (!source_id || typeof source_id !== 'string') throw new ApiError('source_id is required', 400);
    if (!target_id || typeof target_id !== 'string') throw new ApiError('target_id is required', 400);
    if (!VALID_KINDS.includes(kind as ConnectionKind)) {
      throw new ApiError(`kind must be one of: ${VALID_KINDS.join(', ')}`, 400);
    }

    const src = getAgentCard(source_id);
    if (!src) throw new ApiError(`source agent card '${source_id}' not found`, 404);

    const tgt = getAgentCard(target_id);
    if (!tgt) throw new ApiError(`target agent card '${target_id}' not found`, 404);

    let connection;
    try {
      connection = createConnection({
        source_id,
        target_id,
        kind: kind as ConnectionKind,
        directed: Boolean(directed),
        label: typeof label === 'string' ? label : undefined,
      });
    } catch (err) {
      // SQLite UNIQUE constraint violation → 409
      if (err instanceof Error && err.message.includes('UNIQUE')) {
        throw new ApiError(
          `Connection already exists between '${source_id}' and '${target_id}' with kind '${kind}'`,
          409,
        );
      }
      throw err;
    }

    // Auto-create peer conversation for the connected pair
    const conversation = createConversation({
      kind: conversationKindFor(kind as ConnectionKind),
      title: `${src.display_name} ↔ ${tgt.display_name}`,
      participant_ids: [source_id, target_id],
    });

    broadcast({ type: 'connection.added', v: 1, connection });

    return Response.json({ connection, conversation }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
