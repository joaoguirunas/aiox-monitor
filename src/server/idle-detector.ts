import { db } from '../lib/db';
import { broadcast } from './ws-broadcaster';
import type { Agent, AgentStatus } from '../lib/types';

// Fallback constants (seconds) — used if company_config query fails
const DEFAULT_TIMEOUT_LOUNGE = 300;   // working → idle  (5 min)
const DEFAULT_TIMEOUT_BREAK  = 900;   // idle    → break (15 min)
const TIMEOUT_OFFLINE        = 3600;  // break   → offline (1h) — no column in schema

const CHECK_INTERVAL_MS = 30_000;

// Read lounge/break timeouts from company_config (single row, id=1)
function getTimeouts(): { lounge: number; break: number } {
  try {
    const row = db.prepare(
      'SELECT idle_timeout_lounge, idle_timeout_break FROM company_config WHERE id = 1'
    ).get() as { idle_timeout_lounge: number; idle_timeout_break: number } | undefined;
    return {
      lounge: row?.idle_timeout_lounge ?? DEFAULT_TIMEOUT_LOUNGE,
      break:  row?.idle_timeout_break  ?? DEFAULT_TIMEOUT_BREAK,
    };
  } catch {
    return { lounge: DEFAULT_TIMEOUT_LOUNGE, break: DEFAULT_TIMEOUT_BREAK };
  }
}

export function startIdleDetector(): void {
  setInterval(checkIdleAgents, CHECK_INTERVAL_MS);
  console.log('[idle-detector] started (interval: 30s)');
}

// Prepared statements — created once, reused every interval tick
const queryWorking = db.prepare(`
  SELECT * FROM agents
  WHERE status = 'working'
    AND CAST(strftime('%s', 'now') AS INTEGER) - CAST(strftime('%s', last_active) AS INTEGER) > ?
`);

const queryIdle = db.prepare(`
  SELECT * FROM agents
  WHERE status = 'idle'
    AND CAST(strftime('%s', 'now') AS INTEGER) - CAST(strftime('%s', last_active) AS INTEGER) > ?
`);

const queryBreak = db.prepare(`
  SELECT * FROM agents
  WHERE status = 'break'
    AND CAST(strftime('%s', 'now') AS INTEGER) - CAST(strftime('%s', last_active) AS INTEGER) > ?
`);

const updateStatus = db.prepare(`UPDATE agents SET status = ? WHERE id = ? AND status = ?`);

function checkIdleAgents(): void {
  const timeouts = getTimeouts();

  const toIdle    = queryWorking.all(timeouts.lounge) as unknown as Agent[];
  const toBreak   = queryIdle.all(timeouts.break)     as unknown as Agent[];
  const toOffline = queryBreak.all(TIMEOUT_OFFLINE)   as unknown as Agent[];

  applyTransitions(toIdle,    'idle');
  applyTransitions(toBreak,   'break');
  applyTransitions(toOffline, 'offline');
}

function applyTransitions(agents: Agent[], newStatus: AgentStatus): void {
  if (agents.length === 0) return;

  for (const agent of agents) {
    // Conditional UPDATE — only if status hasn't changed between query and update (AC8)
    const result = updateStatus.run(newStatus, agent.id, agent.status);
    if ((result as { changes: number }).changes === 0) continue; // already transitioned

    const updated: Agent = { ...agent, status: newStatus, current_tool: undefined };
    try {
      broadcast({ type: 'agent:update', agent: updated, projectId: agent.project_id });
    } catch { /* fire-and-forget */ }
  }
}
