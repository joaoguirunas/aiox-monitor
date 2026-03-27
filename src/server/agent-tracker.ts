import { upsertAgent, updateAgentStatus } from '../lib/queries';
import { broadcast } from './ws-broadcaster';
import { db } from '../lib/db';
import type { Agent, EventType } from '../lib/types';
import { readFileSync } from 'fs';
import { join } from 'path';

// ─── Known AIOX agents with role & team ─────────────────────────────────────

const KNOWN_AGENTS: Record<string, { display: string; role: string; team: string }> = {
  '@dev':              { display: 'Dex',    role: 'Developer',        team: 'Engineering' },
  '@qa':               { display: 'Quinn',  role: 'QA Engineer',      team: 'Quality' },
  '@architect':        { display: 'Aria',   role: 'Architect',        team: 'Engineering' },
  '@pm':               { display: 'Morgan', role: 'Product Manager',  team: 'Product' },
  '@sm':               { display: 'River',  role: 'Scrum Master',     team: 'Product' },
  '@po':               { display: 'Pax',    role: 'Product Owner',    team: 'Product' },
  '@analyst':          { display: 'Atlas',  role: 'Analyst',          team: 'Research' },
  '@devops':           { display: 'Gage',   role: 'DevOps Engineer',  team: 'Infrastructure' },
  '@data-engineer':    { display: 'Dara',   role: 'Data Engineer',    team: 'Engineering' },
  '@ux-design-expert': { display: 'Uma',    role: 'UX Designer',      team: 'Design' },
  '@aiox-master':      { display: 'AIOX',   role: 'Orchestrator',     team: 'Management' },
};

// ─── Custom agent metadata cache ────────────────────────────────────────────

interface CustomAgentMeta {
  role: string;
  team: string;
}

const customAgentCache = new Map<string, CustomAgentMeta>();

/** Try to read role from .aiox-core/development/agents/{name}.md YAML frontmatter */
function resolveCustomAgentMeta(agentName: string): CustomAgentMeta {
  const cached = customAgentCache.get(agentName);
  if (cached) return cached;

  const defaults: CustomAgentMeta = { role: 'Agent', team: 'Custom' };

  const id = agentName.startsWith('@') ? agentName.slice(1) : agentName;
  if (!id) {
    customAgentCache.set(agentName, defaults);
    return defaults;
  }

  try {
    const filePath = join(process.cwd(), '.aiox-core', 'development', 'agents', `${id}.md`);
    const content = readFileSync(filePath, 'utf-8');
    // Extract persona.role from YAML block — look for "role:" line
    const roleMatch = content.match(/^\s*role:\s*(.+)$/m);
    if (roleMatch) {
      const role = roleMatch[1].trim().replace(/^['"]|['"]$/g, '');
      const meta: CustomAgentMeta = { role, team: 'Custom' };
      customAgentCache.set(agentName, meta);
      return meta;
    }
  } catch {
    // File not found or unreadable — use defaults
  }

  customAgentCache.set(agentName, defaults);
  return defaults;
}

// ─── Display name resolver ──────────────────────────────────────────────────

/** Generate a display name for an agent — known agents get persona names, others get title-cased */
function resolveDisplayName(agentName: string): string | undefined {
  const known = KNOWN_AGENTS[agentName];
  if (known) return known.display;
  // Custom agents: "@my-squad-agent" → "My Squad Agent"
  const id = agentName.startsWith('@') ? agentName.slice(1) : agentName;
  if (!id) return undefined;
  return id
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}


// ─── Helpers ────────────────────────────────────────────────────────────────

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

// ─── Main tracker ───────────────────────────────────────────────────────────

export function trackAgent(
  projectId: number,
  agentName: string,
  eventType: EventType,
  toolName?: string,
): Agent {
  const displayName = resolveDisplayName(agentName);

  // Resolve role & team
  const known = KNOWN_AGENTS[agentName];
  let role: string;
  let team: string;
  if (known) {
    role = known.role;
    team = known.team;
  } else {
    const meta = resolveCustomAgentMeta(agentName);
    role = meta.role;
    team = meta.team;
  }

  const agent = upsertAgent(projectId, agentName, { displayName, role, team });

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
  const atMatches = [...text.matchAll(/(?:^|[\s"'({[,;:])(@[a-zA-Z][a-zA-Z0-9_-]*)/g)];
  if (atMatches.length > 0) {
    const sorted = atMatches
      .map((m) => m[1])
      .filter((n) => n !== '@unknown')
      .sort((a, b) => b.length - a.length);
    if (sorted.length > 0) return sorted[0];
  }

  return '@unknown';
}
