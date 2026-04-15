/**
 * PATCH /api/canvas/layout — salvar viewport e posições de nós
 * Body: { project_path, viewport?, node_positions? }
 *
 * Debounced on client side (500ms per master plan §3.4).
 * Upserts canvas_layouts row for the project.
 */

import { apiErrorResponse, ApiError } from '@/lib/api-utils';
import { upsertCanvasLayout } from '@/lib/canvas-queries';
import { broadcast } from '@/server/ws-broadcaster';

export async function PATCH(request: Request): Promise<Response> {
  try {
    const body = await request.json() as Record<string, unknown>;
    const { project_path, viewport, node_positions } = body;

    if (!project_path || typeof project_path !== 'string') {
      throw new ApiError('project_path is required', 400);
    }

    if (viewport !== undefined && typeof viewport !== 'object') {
      throw new ApiError('viewport must be an object { x, y, zoom }', 400);
    }

    if (node_positions !== undefined && typeof node_positions !== 'object') {
      throw new ApiError('node_positions must be an object { [nodeId]: { x, y } }', 400);
    }

    const layout = upsertCanvasLayout(project_path, {
      viewport: viewport as { x: number; y: number; zoom: number } | undefined,
      node_positions: node_positions as Record<string, { x: number; y: number }> | undefined,
    });

    broadcast({ type: 'layout.patch', v: 1, projectPath: project_path, layout });

    return Response.json(layout);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
