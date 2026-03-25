import { insertEvent, createSession, closeSession, getEvents, getTerminalAgentByPid } from '../lib/queries';
import { detectProject } from './project-detector';
import { trackTerminal, deactivateTerminal } from './terminal-tracker';
import { trackAgent, detectAgentFromPayload } from './agent-tracker';
import { resolveMaestriName } from './maestri-resolver';
import { broadcast } from './ws-broadcaster';
import type { EventPayload, EventType } from '../lib/types';

const VALID_TYPES = new Set<string>([
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'Stop',
  'SubagentStop',
]);


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

function extractReadableInput(input: unknown): string | undefined {
  if (input === null || input === undefined) return undefined;
  if (typeof input === 'string') return input.length > 500 ? input.slice(0, 500) : input;
  if (typeof input === 'object' && input !== null) {
    const obj = input as Record<string, unknown>;
    // Extract the most meaningful field from tool_input objects
    for (const key of ['command', 'query', 'prompt', 'content', 'message', 'file_path', 'pattern', 'description']) {
      const val = obj[key];
      if (typeof val === 'string' && val.length > 0) {
        return val.length > 500 ? val.slice(0, 500) : val;
      }
    }
  }
  return truncate(input);
}

// Cache: remember last known agent per terminal PID
const terminalAgentCache = new Map<number, string>();

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

  // 1b. Broadcast project update (new or refreshed last_active)
  try { broadcast({ type: 'project:update', project }); } catch { /* fire-and-forget */ }

  // 2. Detect agent name — trust hook detection first, then server-side Skill/Agent
  //    detection, then terminal cache, then fallback.
  //    We do NOT scan tool output server-side — file contents cause false positives.
  let detected = payload.agent_name?.trim() || undefined;

  // Server-side fallback: detect from Skill/Agent tool input or UserPromptSubmit
  if (!detected || detected === '@unknown') {
    if (payload.tool_name === 'Skill' || payload.tool_name === 'Agent' || eventType === 'UserPromptSubmit') {
      const inputStr = typeof payload.input === 'string' ? payload.input : JSON.stringify(payload.input ?? '');
      const found = detectAgentFromPayload(inputStr);
      if (found !== '@unknown') detected = found;
    }
  }

  const pid = payload.terminal_pid;
  let agentName: string;

  if (detected && detected !== '@unknown') {
    agentName = detected;
    // Cache this known agent for the terminal (sticky until a different agent is detected)
    if (pid !== undefined) terminalAgentCache.set(pid, detected);
  } else if (pid !== undefined && terminalAgentCache.has(pid)) {
    // Reuse last known agent for this terminal — persists across events within and across sessions
    agentName = terminalAgentCache.get(pid)!;
  } else if (pid !== undefined) {
    // DB fallback: check terminal's stored agent_name (survives server restarts)
    const dbAgent = getTerminalAgentByPid(pid);
    if (dbAgent) {
      agentName = dbAgent;
      terminalAgentCache.set(pid, dbAgent); // re-warm the cache
    } else {
      agentName = '@unknown';
    }
  } else {
    agentName = '@unknown';
  }

  // 3. Track agent (before terminal, so we have display_name)
  const agent = trackAgent(project.id, agentName, eventType, payload.tool_name);

  // 4. Track terminal (if pid provided)
  const inputSummary = extractReadableInput(payload.input);
  // Resolve Maestri terminal name from UUID (if running inside Maestri)
  const maestriName = payload.maestri_terminal_id
    ? resolveMaestriName(payload.maestri_terminal_id)
    : undefined;
  const terminal =
    payload.terminal_pid !== undefined
      ? trackTerminal(project.id, payload.terminal_pid, {
          sessionId: payload.terminal_session_id,
          agentName: agentName !== '@unknown' ? agentName : undefined,
          agentDisplayName: agent.display_name,
          currentTool: payload.tool_name,
          currentInput: inputSummary,
          windowTitle: maestriName,
        })
      : undefined;

  // 4b. Broadcast terminal update with agent info (if terminal was tracked)
  if (terminal) {
    try { broadcast({ type: 'terminal:update', terminal, projectId: project.id }); } catch { /* fire-and-forget */ }
  }

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
    input_summary: inputSummary,
    output_summary: truncate(payload.output),
    raw_payload: truncate(payload, 2000),
  });

  // 7. Broadcast event to WS clients (fire-and-forget)
  try {
    broadcast({ type: 'event:new', event, projectId: project.id, agentId: agent.id });
  } catch { /* never block event processing */ }

  // 8. On Stop: deactivate terminal + close session
  //    SubagentStop means a spawned subagent finished — the parent conversation
  //    is still active, so we must NOT deactivate the terminal or close the session.
  if (eventType === 'Stop' && terminal) {
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
