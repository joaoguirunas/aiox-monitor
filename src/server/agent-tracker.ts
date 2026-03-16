import { upsertAgent, updateAgentStatus } from '../lib/queries';
import { broadcast } from './ws-broadcaster';
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
    const updated: Agent = { ...agent, status: 'idle', current_tool: undefined };
    try { broadcast({ type: 'agent:update', agent: updated, projectId }); } catch { /* fire-and-forget */ }
    return updated;
  }

  // Any non-Stop event resets agent to 'working' (also resets idle detector timer)
  const status = 'working';
  if (status !== agent.status || toolName !== agent.current_tool) {
    updateAgentStatus(projectId, agentName, status, toolName ?? null);
  }

  const updated: Agent = { ...agent, status, current_tool: toolName };
  try { broadcast({ type: 'agent:update', agent: updated, projectId }); } catch { /* fire-and-forget */ }
  return updated;
}

/** Best-effort: scan payload text for agent patterns in any format.
 *  Matches: @name, AIOX:agents:name, agents:name, AIOX/agents/name, agents/name */
export function detectAgentFromPayload(payload: unknown): string {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload ?? '');
  const agentNames = Object.keys(DISPLAY_NAMES);
  for (const name of agentNames) {
    if (text.includes(name)) return name;
    const id = name.slice(1); // "@analyst" -> "analyst"
    if (
      text.includes(`AIOX:agents:${id}`) ||
      text.includes(`agents:${id}`) ||
      text.includes(`AIOX/agents/${id}`) ||
      text.includes(`agents/${id}`)
    ) return name;
  }
  return '@unknown';
}
