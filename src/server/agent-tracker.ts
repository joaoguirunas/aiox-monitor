import { upsertAgent, updateAgentStatus } from '../lib/queries';
import { broadcast } from './ws-broadcaster';
import { db } from '../lib/db';
import type { Agent, EventType } from '../lib/types';

const DISPLAY_NAMES: Record<string, string> = {
  '@dev': 'Dex',
  '@qa': 'Quinn',
  '@architect': 'Aria',
  '@pm': 'Morgan',
  '@sm': 'River',
  '@po': 'Pax',
  '@analyst': 'Atlas',
  '@devops': 'Gage',
  '@data-engineer': 'Dara',
  '@ux-design-expert': 'Uma',
  '@aiox-master': 'AIOX',
};

const STOP_TYPES = new Set<EventType>(['Stop', 'SubagentStop']);

/** Fetch terminal enrichment fields for the most recent terminal of an agent */
function getTerminalEnrichment(projectId: number, agentName: string): { waiting_permission: 0 | 1; current_tool_detail: string | null; terminal_count: number } {
  try {
    const row = db.prepare(
      `SELECT waiting_permission, current_tool_detail
       FROM terminals
       WHERE agent_name = ? AND project_id = ? AND status IN ('processing', 'active')
       ORDER BY last_active DESC LIMIT 1`
    ).get(agentName, projectId) as { waiting_permission?: number; current_tool_detail?: string } | undefined;

    const countRow = db.prepare(
      `SELECT COUNT(*) as cnt FROM terminals
       WHERE agent_name = ? AND project_id = ? AND status IN ('processing', 'active')`
    ).get(agentName, projectId) as { cnt: number } | undefined;

    return {
      waiting_permission: (row?.waiting_permission ?? 0) as 0 | 1,
      current_tool_detail: row?.current_tool_detail ?? null,
      terminal_count: countRow?.cnt ?? 0,
    };
  } catch {
    return { waiting_permission: 0, current_tool_detail: null, terminal_count: 0 };
  }
}

export function trackAgent(
  projectId: number,
  agentName: string,
  eventType: EventType,
  toolName?: string,
): Agent {
  const displayName = DISPLAY_NAMES[agentName];
  const agent = upsertAgent(projectId, agentName, displayName);

  if (STOP_TYPES.has(eventType)) {
    updateAgentStatus(projectId, agentName, 'idle', null);
    const enrichment = getTerminalEnrichment(projectId, agentName);
    const updated: Agent = { ...agent, status: 'idle', current_tool: undefined, waiting_permission: 0, current_tool_detail: undefined };
    try { broadcast({ type: 'agent:update', agent: { ...updated, ...enrichment }, projectId }); } catch { /* fire-and-forget */ }
    return updated;
  }

  // Any non-Stop event resets agent to 'working' (also resets idle detector timer)
  const status = 'working';
  if (status !== agent.status || toolName !== agent.current_tool) {
    updateAgentStatus(projectId, agentName, status, toolName ?? null);
  }

  const enrichment = getTerminalEnrichment(projectId, agentName);
  const updated: Agent = { ...agent, status, current_tool: toolName };
  try { broadcast({ type: 'agent:update', agent: { ...updated, ...enrichment }, projectId }); } catch { /* fire-and-forget */ }
  return updated;
}

/** Best-effort: scan payload text for agent patterns in any format.
 *  Matches: @name, AIOX:agents:name, agents:name, AIOX/agents/name, agents/name
 *  Names are sorted longest-first so "@aiox-master" and "@data-engineer" are
 *  checked before shorter substrings like "@dev" or "@analyst". */
export function detectAgentFromPayload(payload: unknown): string {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload ?? '');
  // Sort longest-first to avoid substring false positives (e.g. @dev matching @devops)
  const agentNames = Object.keys(DISPLAY_NAMES).sort((a, b) => b.length - a.length);
  for (const name of agentNames) {
    const id = name.slice(1); // "@analyst" -> "analyst"
    // Check activation patterns first (most reliable)
    if (
      text.includes(`AIOX:agents:${id}`) ||
      text.includes(`agents:${id}`) ||
      text.includes(`AIOX/agents/${id}`) ||
      text.includes(`agents/${id}`)
    ) return name;
    // Check @name with word boundary (avoid @dev matching inside @devops)
    const nameIdx = text.indexOf(name);
    if (nameIdx >= 0) {
      const afterChar = text[nameIdx + name.length] ?? '';
      // Only match if followed by non-alphanumeric or end-of-string
      if (!/[a-zA-Z0-9_-]/.test(afterChar)) return name;
    }
  }
  return '@unknown';
}
