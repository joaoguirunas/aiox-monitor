import { insertEvent, createSession, closeSession, getEvents } from '../lib/queries';
import { detectProject } from './project-detector';
import { trackTerminal, deactivateTerminal } from './terminal-tracker';
import { trackAgent, detectAgentFromPayload } from './agent-tracker';
import { broadcast } from './ws-broadcaster';
import type { EventPayload, EventType } from '../lib/types';

const VALID_TYPES = new Set<string>([
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'Stop',
  'SubagentStop',
]);

const STOP_TYPES = new Set<string>(['Stop', 'SubagentStop']);

function toEventType(hookType: string): EventType {
  if (VALID_TYPES.has(hookType)) return hookType as EventType;
  // Unknown hook types mapped to the closest equivalent
  return 'UserPromptSubmit';
}

function truncate(value: unknown, maxLen = 500): string | undefined {
  if (value === null || value === undefined) return undefined;
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

export interface ProcessedEvent {
  id: number;
  project_id: number;
  agent_id?: number;
  terminal_id?: number;
  type: EventType;
}

export function processEvent(payload: EventPayload): ProcessedEvent {
  const eventType = toEventType(payload.hook_type);

  // 1. Detect / upsert project
  const project = detectProject(payload.project_path, payload.project_name);

  // 2. Detect agent name (from field or payload text scan)
  const agentName =
    payload.agent_name?.trim() ||
    detectAgentFromPayload(payload.input) ||
    '@unknown';

  // 3. Track terminal (if pid provided)
  const terminal =
    payload.terminal_pid !== undefined
      ? trackTerminal(project.id, payload.terminal_pid, payload.terminal_session_id)
      : undefined;

  // 4. Track agent
  const agent = trackAgent(project.id, agentName, eventType, payload.tool_name);

  // 5. Resolve or create an active session for this terminal
  let sessionId: number | undefined;
  if (terminal) {
    if (eventType === 'UserPromptSubmit') {
      // New prompt = new session
      const session = createSession(project.id, agent.id, terminal.id);
      sessionId = session.id;
    } else {
      // Find the most recent active session for this terminal
      const { events } = getEvents({
        projectId: project.id,
        terminalId: terminal.id,
        type: 'UserPromptSubmit',
        limit: 1,
      });
      sessionId = events[0]?.session_id ?? undefined;
    }
  }

  // 6. Insert event
  const event = insertEvent({
    project_id: project.id,
    agent_id: agent.id,
    session_id: sessionId,
    terminal_id: terminal?.id,
    type: eventType,
    tool: payload.tool_name,
    input_summary: truncate(payload.input),
    output_summary: truncate(payload.output),
    raw_payload: truncate(payload, 2000),
  });

  // 7. Broadcast event to WS clients (fire-and-forget)
  try {
    broadcast({ type: 'event:new', event, projectId: project.id, agentId: agent.id });
  } catch { /* never block event processing */ }

  // 8. On Stop/SubagentStop: deactivate terminal + close session
  if (STOP_TYPES.has(eventType) && terminal) {
    deactivateTerminal(project.id, terminal.pid);
    if (sessionId !== undefined) {
      closeSession(sessionId);
    }
  }

  return {
    id: event.id,
    project_id: project.id,
    agent_id: agent.id,
    terminal_id: terminal?.id,
    type: eventType,
  };
}
