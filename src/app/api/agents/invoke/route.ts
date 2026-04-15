/**
 * POST /api/agents/invoke — JOB-036
 *
 * Creates an AgentCard on the canvas from a skill_path in the catalog.
 *
 * Body:
 *   skill_path:   string   — canonical path e.g. '/AIOX:agents:dev'
 *   project_path: string   — absolute project path
 *   kind?:        'chat' | 'terminal' | 'hybrid'  (default: 'chat')
 *   position?:    { x: number, y: number }         (stored in canvas layout)
 *   is_chief?:    boolean  (creates connections to all active project cards)
 *
 * Validation:
 *   - skill_path must exist in agent_catalog for project_path.
 *     If not found: triggers a fresh scan, then re-checks once.
 *     Still missing → 404 with hint.
 *
 * Idempotency:
 *   - Same skill_path + project_path + kind invoked within 5s → returns existing card.
 *
 * PTY (kind='terminal'):
 *   - v1: stub PTY via promote module (story 9.7 implements real node-pty).
 *
 * Chief (is_chief=true):
 *   - Sets is_chief=1 on the card.
 *   - Creates 'supervise' connections to all active cards in the project.
 *
 * Returns: { cardId, kind, status, skill_path, project_path, isNew }
 */

import { apiErrorResponse, ApiError } from '@/lib/api-utils';
import {
  getCatalogEntry,
  findRecentCard,
  createAgentCard,
  listActiveCards,
  createConnection,
  listAgentCards,
} from '@/lib/canvas-queries';
import { getCatalog } from '@/server/agent-catalog/service';
import { broadcast } from '@/server/ws-broadcaster';
import type { AgentKind } from '@/lib/canvas-queries';

const VALID_KINDS: AgentKind[] = ['chat', 'terminal', 'hybrid'];

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as Record<string, unknown>;
    const { skill_path, project_path, kind = 'chat', position, is_chief = false } = body;

    // ── Validate inputs ────────────────────────────────────────────────────
    if (!skill_path || typeof skill_path !== 'string') {
      throw new ApiError('skill_path is required', 400);
    }
    if (!project_path || typeof project_path !== 'string') {
      throw new ApiError('project_path is required', 400);
    }
    if (!VALID_KINDS.includes(kind as AgentKind)) {
      throw new ApiError(`kind must be one of: ${VALID_KINDS.join(', ')}`, 400);
    }

    // ── Catalog validation ─────────────────────────────────────────────────
    let catalogEntry = getCatalogEntry(project_path, skill_path);

    if (!catalogEntry) {
      // Cold catalog: trigger a fresh scan and re-check once
      getCatalog(project_path);
      catalogEntry = getCatalogEntry(project_path, skill_path);
    }

    if (!catalogEntry) {
      throw new ApiError(
        `skill_path '${skill_path}' não encontrado no catálogo de '${project_path}'. ` +
        `Instale o agente via squad-creator ou verifique se o projeto está aberto (POST /api/projects/open).`,
        404,
      );
    }

    // ── Idempotency: return existing card if created within 5s ────────────
    const recent = findRecentCard(project_path, skill_path, kind as AgentKind, 5);
    if (recent) {
      return Response.json({
        cardId: recent.id,
        kind: recent.kind,
        status: recent.status,
        skill_path,
        project_path,
        isNew: false,
      });
    }

    // ── Create agent card ──────────────────────────────────────────────────
    const card = createAgentCard({
      kind: kind as AgentKind,
      display_name: catalogEntry.display_name,
      aiox_agent: catalogEntry.agent_id,
      project_path,
      skill_path,
      is_chief: Boolean(is_chief),
    });

    // ── PTY stub for terminal/hybrid kinds ────────────────────────────────
    if (kind === 'terminal' || kind === 'hybrid') {
      // v1 stub — story 9.7 wires real node-pty/ProcessManager
      // For now we just mark it as 'waiting' and note the skill_path
      // The stub PTY approach from promote.ts will be wired in 9.7
      // Card already has the correct kind; update status to waiting
      const { db } = await import('@/lib/db');
      db.prepare(
        `UPDATE agent_cards SET status = 'waiting', last_active = datetime('now') WHERE id = ?`
      ).run(card.id);
      card.status = 'waiting';
    }

    // ── Store position in canvas layout if provided ────────────────────────
    if (position && typeof position === 'object' && project_path) {
      const pos = position as { x?: number; y?: number };
      if (typeof pos.x === 'number' && typeof pos.y === 'number') {
        const { upsertCanvasLayout } = await import('@/lib/canvas-queries');
        const existingLayout = await (async () => {
          const { getCanvasLayout } = await import('@/lib/canvas-queries');
          return getCanvasLayout(project_path);
        })();
        const existingPositions = existingLayout
          ? JSON.parse(existingLayout.node_positions) as Record<string, { x: number; y: number }>
          : {};
        existingPositions[card.id] = { x: pos.x, y: pos.y };
        upsertCanvasLayout(project_path, { node_positions: existingPositions });
      }
    }

    // ── Chief: wire supervise connections to all active cards ──────────────
    if (is_chief) {
      const activeCards = listActiveCards(project_path).filter(c => c.id !== card.id);
      for (const peer of activeCards) {
        try {
          const conn = createConnection({
            source_id: card.id,
            target_id: peer.id,
            kind: 'supervise',
            directed: true,
            label: 'chief',
          });
          broadcast({ type: 'connection.added', v: 1, connection: conn });
        } catch {
          // Skip if connection already exists (UNIQUE constraint)
        }
      }
    }

    // ── Broadcast ──────────────────────────────────────────────────────────
    broadcast({ type: 'agent.added', v: 1, card });

    return Response.json(
      {
        cardId: card.id,
        kind: card.kind,
        status: card.status,
        skill_path,
        project_path,
        isNew: true,
      },
      { status: 201 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

// ── GET: list existing cards for a project (convenience) ──────────────────────
export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const project_path = searchParams.get('project_path');
    if (!project_path) throw new ApiError('project_path is required', 400);

    const cards = listAgentCards(project_path);
    return Response.json(cards);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
