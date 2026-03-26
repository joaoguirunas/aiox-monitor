import { upsertAgent, updateAgentStatus } from '../lib/queries';
import { broadcast } from './ws-broadcaster';
import { db } from '../lib/db';
import type { Agent, EventType } from '../lib/types';

// Known display names for standard AIOX agents — custom/squad agents get auto-generated names
const KNOWN_DISPLAY_NAMES: Record<string, string> = {
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

/** Generate a display name for an agent — known agents get persona names, others get title-cased */
function resolveDisplayName(agentName: string): string | undefined {
  const known = KNOWN_DISPLAY_NAMES[agentName];
  if (known) return known;
  // Custom agents: "@my-squad-agent" → "My Squad Agent"
  const id = agentName.startsWith('@') ? agentName.slice(1) : agentName;
  if (!id) return undefined;
  return id
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

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
  const displayName = resolveDisplayName(agentName);
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

/** Detect agent from payload text using pattern matching.
 *  Supports ANY agent name — not limited to the known list.
 *
 *  Detection priority:
 *  1. AIOX:agents:{name} or agents:{name} — Skill tool activation (most reliable)
 *  2. AIOX/agents/{name} or agents/{name} — file path references
 *  3. /AIOX:agents:{name} — slash command activation
 *  4. @{name} — direct @ mention with word boundary
 */
export function detectAgentFromPayload(payload: unknown): string {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload ?? '');

  // 1. AIOX:agents:{name} or agents:{name} — captures the agent ID after the colon
  //    Matches: "AIOX:agents:my-custom-agent", "agents:squad-creator"
  const colonMatch = text.match(/(?:AIOX:)?agents:([a-zA-Z0-9_-]+)/);
  if (colonMatch) {
    const name = `@${colonMatch[1]}`;
    if (name !== '@unknown') return name;
  }

  // 2. AIOX/agents/{name} or agents/{name} — file path references
  const pathMatch = text.match(/(?:AIOX\/)?agents\/([a-zA-Z0-9_-]+)/);
  if (pathMatch) {
    const name = `@${pathMatch[1]}`;
    if (name !== '@unknown') return name;
  }

  // 3. /AIOX:agents:{name} — slash command format
  const slashMatch = text.match(/\/AIOX:agents:([a-zA-Z0-9_-]+)/);
  if (slashMatch) {
    const name = `@${slashMatch[1]}`;
    if (name !== '@unknown') return name;
  }

  // 4. @{name} — direct mention with word boundary
  //    Must be preceded by whitespace/start and followed by non-alphanumeric/end
  //    Avoid matching email addresses (check no preceding alphanumeric/dot)
  const atMatches = [...text.matchAll(/(?:^|[\s"'({[,;:])(@[a-zA-Z][a-zA-Z0-9_-]*)/g)];
  if (atMatches.length > 0) {
    // Pick the longest match to avoid @dev matching before @devops
    const sorted = atMatches
      .map((m) => m[1])
      .filter((n) => n !== '@unknown')
      .sort((a, b) => b.length - a.length);
    if (sorted.length > 0) return sorted[0];
  }

  return '@unknown';
}
