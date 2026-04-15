/**
 * DELETE /api/connections/:id — remover aresta
 */

import { apiErrorResponse, ApiError } from '@/lib/api-utils';
import { getConnection, deleteConnection } from '@/lib/canvas-queries';
import { broadcast } from '@/server/ws-broadcaster';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const existing = getConnection(id);
    if (!existing) throw new ApiError('Connection not found', 404);

    const deleted = deleteConnection(id);
    if (!deleted) throw new ApiError('Failed to delete connection', 500);

    broadcast({ type: 'connection.removed', v: 1, id });

    return Response.json({ success: true, id });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
