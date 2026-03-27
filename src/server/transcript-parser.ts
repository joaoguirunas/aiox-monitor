/**
 * JSONL Transcript Parser — reads Claude Code transcript files incrementally
 * and extracts tool_use, tool_result, and turn_duration events.
 *
 * Inspired by pixel-agents (github.com/pablodelucca/pixel-agents).
 */

import { open, stat } from 'node:fs/promises';

// ─── Tool Status Mapping ────────────────────────────────────────────────────

const TOOL_STATUS_MAP: Record<string, (input: Record<string, unknown>) => string> = {
  Bash:       (i) => `Running: ${truncate(String(i.command ?? i.description ?? ''), 50)}`,
  Read:       (i) => `Reading ${basename(String(i.file_path ?? ''))}`,
  Write:      (i) => `Writing ${basename(String(i.file_path ?? ''))}`,
  Edit:       (i) => `Editing ${basename(String(i.file_path ?? ''))}`,
  Grep:       ()  => 'Searching code',
  Glob:       ()  => 'Finding files',
  WebFetch:   ()  => 'Fetching web page',
  WebSearch:  ()  => 'Searching the web',
  Agent:      ()  => 'Spawning sub-agent',
  Task:       ()  => 'Spawning sub-agent',
};

/** Tools that never trigger permission prompts */
export const PERMISSION_EXEMPT_TOOLS = new Set(['Task', 'Agent', 'AskUserQuestion']);

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function basename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

export function formatToolStatus(toolName: string, toolInput: Record<string, unknown>): string {
  const formatter = TOOL_STATUS_MAP[toolName];
  if (formatter) return formatter(toolInput);
  return `Using ${toolName}`;
}

// ─── Event Types ────────────────────────────────────────────────────────────

export interface ToolStartEvent {
  type: 'tool_start';
  toolId: string;
  toolName: string;
  friendlyStatus: string;
}

export interface ToolDoneEvent {
  type: 'tool_done';
  toolId: string;
}

export interface TurnEndEvent {
  type: 'turn_end';
}

export interface AgentDetectedEvent {
  type: 'agent_detected';
  agentName: string;
}

export type TranscriptEvent = ToolStartEvent | ToolDoneEvent | TurnEndEvent | AgentDetectedEvent;

// ─── Incremental Parser ─────────────────────────────────────────────────────

export interface ParserState {
  offset: number;
  partialLine: string;
}

export function createParserState(): ParserState {
  return { offset: 0, partialLine: '' };
}

/**
 * Read new lines from a JSONL file starting at the given offset.
 * Returns parsed events and updates the state in-place.
 * Reads at most `maxLines` lines per call to avoid blocking.
 */
export async function parseIncremental(
  filePath: string,
  state: ParserState,
  maxLines = 100,
): Promise<TranscriptEvent[]> {
  let fileSize: number;
  try {
    const s = await stat(filePath);
    fileSize = s.size;
  } catch {
    return [];
  }

  if (fileSize <= state.offset) return [];

  // Read ONLY the new bytes using file handle with offset (not the entire file)
  const bytesToRead = fileSize - state.offset;
  let newData: string;
  try {
    const fh = await open(filePath, 'r');
    try {
      const buf = Buffer.alloc(bytesToRead);
      await fh.read(buf, 0, bytesToRead, state.offset);
      newData = buf.toString('utf-8');
    } finally {
      await fh.close();
    }
  } catch {
    return [];
  }
  state.offset = fileSize;

  // Combine with any partial line from last read
  const text = state.partialLine + newData;
  const lines = text.split('\n');

  // Last element might be partial (no trailing newline)
  state.partialLine = lines.pop() ?? '';

  const events: TranscriptEvent[] = [];
  const linesToProcess = lines.slice(0, maxLines);

  for (const line of linesToProcess) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const record = JSON.parse(trimmed);
      const parsed = extractEvents(record);
      if (parsed) events.push(...parsed);
    } catch {
      // Corrupted line — skip
    }
  }

  // If we truncated, put remaining lines back as partial
  if (lines.length > maxLines) {
    state.partialLine = lines.slice(maxLines).join('\n') + '\n' + state.partialLine;
    state.offset -= Buffer.byteLength(state.partialLine, 'utf-8');
  }

  return events;
}

/**
 * Extract transcript events from a single JSONL record.
 */
function extractEvents(record: Record<string, unknown>): TranscriptEvent[] | null {
  const type = record.type as string | undefined;

  // system → turn_duration
  if (type === 'system') {
    const subtype = record.subtype as string | undefined;
    if (subtype === 'turn_duration') {
      return [{ type: 'turn_end' }];
    }
    return null;
  }

  // assistant → tool_use blocks + agent detection from Skill/Agent tool calls
  if (type === 'assistant') {
    const message = record.message as Record<string, unknown> | undefined;
    const content = (message?.content ?? []) as Array<Record<string, unknown>>;
    const events: TranscriptEvent[] = [];

    for (const block of content) {
      if (block.type === 'tool_use') {
        const toolName = block.name as string;
        const toolId = block.id as string;
        const toolInput = (block.input ?? {}) as Record<string, unknown>;
        events.push({
          type: 'tool_start',
          toolId,
          toolName,
          friendlyStatus: formatToolStatus(toolName, toolInput),
        });

        // Detect agent from Skill/Agent tool inputs — e.g. {"skill":"AIOX:agents:sm-chief"}
        if (toolName === 'Skill' || toolName === 'Agent') {
          const inputStr = JSON.stringify(toolInput);
          const agentMatch = inputStr.match(/(?:AIOX:)?agents:([a-zA-Z0-9_-]+)/);
          if (agentMatch && agentMatch[1] !== 'unknown') {
            events.push({ type: 'agent_detected', agentName: `@${agentMatch[1]}` });
          }
        }
      }
      // Also scan text blocks for agent patterns (system-reminder with skill loading)
      if (block.type === 'text' && typeof block.text === 'string') {
        const agentMatch = (block.text as string).match(/(?:AIOX:)?agents:([a-zA-Z0-9_-]+)/);
        if (agentMatch && agentMatch[1] !== 'unknown') {
          events.push({ type: 'agent_detected', agentName: `@${agentMatch[1]}` });
        }
      }
    }

    return events.length > 0 ? events : null;
  }

  // user → tool_result blocks + agent activation detection
  if (type === 'user') {
    const message = record.message as Record<string, unknown> | undefined;
    const rawContent = message?.content;
    const events: TranscriptEvent[] = [];

    // Detect AIOX agent activation from command-message format
    // e.g. "<command-message>AIOX:agents:aiox-master</command-message>"
    // or slash commands like "/AIOX:agents:dev"
    if (typeof rawContent === 'string') {
      const agentMatch = rawContent.match(/(?:AIOX:)?agents:([a-zA-Z0-9_-]+)/);
      if (agentMatch && agentMatch[1] !== 'unknown') {
        events.push({ type: 'agent_detected', agentName: `@${agentMatch[1]}` });
      }
    }

    const content = (Array.isArray(rawContent) ? rawContent : []) as Array<Record<string, unknown>>;

    for (const block of content) {
      if (block.type === 'tool_result') {
        const toolId = block.tool_use_id as string;
        if (toolId) {
          events.push({ type: 'tool_done', toolId });
        }
      }
      // Also check text blocks for agent activation (skill loading produces text content)
      if (block.type === 'text' && typeof block.text === 'string') {
        const agentMatch = (block.text as string).match(/(?:AIOX:)?agents:([a-zA-Z0-9_-]+)/);
        if (agentMatch && agentMatch[1] !== 'unknown') {
          events.push({ type: 'agent_detected', agentName: `@${agentMatch[1]}` });
        }
      }
    }

    return events.length > 0 ? events : null;
  }

  return null;
}
