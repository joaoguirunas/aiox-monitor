/**
 * PATCH /api/agents/:id — rename, change kind, promote chat→PTY, update status
 * DELETE /api/agents/:id — remove card (cascades connections + participants)
 */

import { apiErrorResponse, ApiError } from '@/lib/api-utils';
import { getAgentCard, updateAgentCard, deleteAgentCard } from '@/lib/canvas-queries';
import { broadcast } from '@/server/ws-broadcaster';
import type { AgentKind, AgentStatus, UpdateAgentCardInput } from '@/lib/canvas-queries';

const VALID_KINDS: AgentKind[] = ['chat', 'terminal', 'hybrid'];
const VALID_STATUSES: AgentStatus[] = ['idle', 'thinking', 'speaking', 'waiting', 'offline', 'error'];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const existing = getAgentCard(id);
    if (!existing) throw new ApiError('Agent card not found', 404);

    const body = await request.json() as Record<string, unknown>;
    const update: UpdateAgentCardInput = {};

    if (body.display_name !== undefined) {
      if (typeof body.display_name !== 'string' || !body.display_name.trim()) {
        throw new ApiError('display_name must be a non-empty string', 400);
      }
      update.display_name = body.display_name.trim();
    }

    if (body.kind !== undefined) {
      if (!VALID_KINDS.includes(body.kind as AgentKind)) {
        throw new ApiError(`kind must be one of: ${VALID_KINDS.join(', ')}`, 400);
      }
      update.kind = body.kind as AgentKind;
    }

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status as AgentStatus)) {
        throw new ApiError(`status must be one of: ${VALID_STATUSES.join(', ')}`, 400);
      }
      update.status = body.status as AgentStatus;
    }

    if (body.pty_terminal_id !== undefined) {
      update.pty_terminal_id = typeof body.pty_terminal_id === 'string' ? body.pty_terminal_id : null;
    }
    if (body.maestri_terminal_name !== undefined) {
      update.maestri_terminal_name = typeof body.maestri_terminal_name === 'string' ? body.maestri_terminal_name : null;
    }
    if (body.system_prompt !== undefined) {
      update.system_prompt = typeof body.system_prompt === 'string' ? body.system_prompt : null;
    }
    if (body.model !== undefined) {
      update.model = typeof body.model === 'string' ? body.model : null;
    }
    if (body.skill_path !== undefined) {
      update.skill_path = typeof body.skill_path === 'string' ? body.skill_path : null;
    }

    const card = updateAgentCard(id, update);

    broadcast({ type: 'agent.updated', v: 1, card });

    return Response.json(card);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const existing = getAgentCard(id);
    if (!existing) throw new ApiError('Agent card not found', 404);

    const deleted = deleteAgentCard(id);
    if (!deleted) throw new ApiError('Failed to delete agent card', 500);

    broadcast({ type: 'agent.removed', v: 1, cardId: id });

    return Response.json({ success: true, id });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
