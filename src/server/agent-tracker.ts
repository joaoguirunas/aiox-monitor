import { upsertAgent, updateAgentStatus } from '@/lib/queries';
import { broadcast } from './ws-broadcaster';
import type { Agent, EventType } from '@/lib/types';

const DISPLAY_NAMES: Record<string, string> = {
  '@dev': 'Dex',
  '@qa': 'Quinn',
  '@architect': 'Aria',
  '@pm': 'Morgan',
  '@sm': 'River',
  '@po': 'Pax',
  '@analyst': 'Alex',
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

  const status = eventType === 'PreToolUse' ? 'working' : agent.status;
  if (toolName || status !== agent.status) {
    updateAgentStatus(projectId, agentName, status, toolName ?? null);
  }

  const updated: Agent = { ...agent, status, current_tool: toolName };
  try { broadcast({ type: 'agent:update', agent: updated, projectId }); } catch { /* fire-and-forget */ }
  return updated;
}

/** Best-effort: scan payload text for @agent-name patterns */
export function detectAgentFromPayload(payload: unknown): string {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload ?? '');
  const agentNames = Object.keys(DISPLAY_NAMES);
  for (const name of agentNames) {
    if (text.includes(name)) return name;
  }
  return '@unknown';
}
