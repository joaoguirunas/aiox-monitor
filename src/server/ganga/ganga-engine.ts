/**
 * Ganga Ativo — Engine principal.
 * Roda a cada 5 minutos quando ativado.
 * Escaneia terminais ativos, detecta prompts pendentes, auto-responde quando seguro.
 */

import { db } from '../../lib/db';
import {
  getCompanyConfig,
  insertGangaLog,
  getGangaStats,
} from '../../lib/queries';
import { broadcast } from '../ws-broadcaster';
import { classifyPrompt, containsQuestion } from './prompt-matcher';
import { sendResponse, isProcessAlive } from './auto-responder';
import type { Terminal, Agent, Project, GangaHeartbeat } from '../../lib/types';

const GANGA_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_EVENT_AGE_SECONDS = 600; // Only process events < 10 min old
const LOG_PREFIX = '[ganga]';

type Row = Record<string, unknown>;

/** Terminals with their last event output */
interface TerminalWithPrompt {
  terminal: Terminal;
  projectId: number;
  projectName: string;
  lastOutput: string;
  eventAge: number;
}

/**
 * Start the Ganga engine loop. Returns the interval handle.
 */
export function startGangaEngine(): ReturnType<typeof setInterval> {
  console.log(`${LOG_PREFIX} engine started (interval: ${GANGA_INTERVAL_MS / 1000}s)`);
  // Run immediately on start, then every interval
  runGangaCycle();
  return setInterval(runGangaCycle, GANGA_INTERVAL_MS);
}

/**
 * Stop the Ganga engine.
 */
export function stopGangaEngine(handle: ReturnType<typeof setInterval>): void {
  clearInterval(handle);
  console.log(`${LOG_PREFIX} engine stopped`);
}

/**
 * Single cycle of the Ganga engine.
 */
function runGangaCycle(): void {
  try {
    const config = getCompanyConfig();
    if (!config.ganga_enabled) return;

    console.log(`${LOG_PREFIX} cycle starting...`);

    // 1. Find active terminals with pending prompts
    const candidates = findPendingPrompts();
    console.log(`${LOG_PREFIX} found ${candidates.length} terminal(s) with potential prompts`);

    let autoResponses = 0;
    let blockedCount = 0;
    let skippedCount = 0;

    // 2. Process each candidate
    for (const candidate of candidates) {
      const result = classifyPrompt(candidate.lastOutput);

      if (result.classification === 'safe') {
        // Validate PID is alive before sending
        if (!isProcessAlive(candidate.terminal.pid)) {
          console.log(`${LOG_PREFIX} PID ${candidate.terminal.pid} not alive, skipping`);
          continue;
        }

        const sent = sendResponse(candidate.terminal.pid, result.suggestedResponse);
        insertGangaLog({
          terminal_id: candidate.terminal.id,
          project_id: candidate.projectId,
          prompt_text: candidate.lastOutput.slice(0, 500),
          response: result.suggestedResponse,
          classification: 'safe',
          action: sent ? 'auto-responded' : 'skipped',
        });

        if (sent) {
          autoResponses++;
          console.log(`${LOG_PREFIX} auto-responded "${result.suggestedResponse}" to terminal ${candidate.terminal.id} (${candidate.projectName})`);
        } else {
          skippedCount++;
          console.log(`${LOG_PREFIX} failed to send to terminal ${candidate.terminal.id}`);
        }
      } else if (result.classification === 'blocked') {
        insertGangaLog({
          terminal_id: candidate.terminal.id,
          project_id: candidate.projectId,
          prompt_text: candidate.lastOutput.slice(0, 500),
          response: '',
          classification: 'blocked',
          action: 'blocked',
        });
        blockedCount++;
        console.log(`${LOG_PREFIX} BLOCKED prompt in terminal ${candidate.terminal.id}: ${result.matchedPattern}`);
      } else {
        // ambiguous → skip silently in v1
        insertGangaLog({
          terminal_id: candidate.terminal.id,
          project_id: candidate.projectId,
          prompt_text: candidate.lastOutput.slice(0, 500),
          response: '',
          classification: 'ambiguous',
          action: 'skipped',
        });
        skippedCount++;
      }
    }

    // 3. Build and broadcast CEO summary
    const heartbeat = buildHeartbeat(autoResponses, blockedCount, skippedCount);
    try {
      broadcast({ type: 'ganga:heartbeat', summary: heartbeat });
    } catch { /* fire-and-forget */ }

    console.log(`${LOG_PREFIX} cycle complete — auto:${autoResponses} blocked:${blockedCount} skipped:${skippedCount}`);
  } catch (err) {
    console.error(`${LOG_PREFIX} cycle failed:`, err);
  }
}

/**
 * Find terminals that have a pending question in their last output.
 */
function findPendingPrompts(): TerminalWithPrompt[] {
  const results: TerminalWithPrompt[] = [];

  // Get active terminals with agents
  const terminals = db.prepare(`
    SELECT t.*, p.name as project_name
    FROM terminals t
    JOIN projects p ON p.id = t.project_id
    WHERE t.status IN ('processing', 'active')
      AND t.agent_name IS NOT NULL
      AND t.agent_name != '@unknown'
  `).all() as (Row & { project_name: string })[];

  for (const t of terminals) {
    const terminal = t as unknown as Terminal & { project_name: string };

    // Get the last event for this terminal
    const lastEvent = db.prepare(`
      SELECT output_summary, type,
             CAST(strftime('%s', 'now') AS INTEGER) - CAST(strftime('%s', created_at) AS INTEGER) as age_seconds
      FROM events
      WHERE terminal_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(terminal.id) as Row | undefined;

    if (!lastEvent) continue;

    const ageSeconds = (lastEvent.age_seconds as number) ?? 0;
    const outputText = (lastEvent.output_summary as string) ?? '';
    const eventType = (lastEvent.type as string) ?? '';

    // Only process if:
    // 1. Event is recent enough (< 10 min)
    // 2. It's a PostToolUse or Stop (tool finished, waiting for input)
    // 3. Output contains a question indicator
    if (
      ageSeconds > MAX_EVENT_AGE_SECONDS ||
      !['PostToolUse', 'Stop'].includes(eventType) ||
      !containsQuestion(outputText)
    ) {
      continue;
    }

    // Check cooldown: don't auto-respond if we already did for this terminal recently
    const recentAutoResponse = db.prepare(`
      SELECT id FROM ganga_log
      WHERE terminal_id = ?
        AND action = 'auto-responded'
        AND created_at >= datetime('now', '-5 minutes')
      LIMIT 1
    `).get(terminal.id) as Row | undefined;

    if (recentAutoResponse) continue;

    results.push({
      terminal,
      projectId: terminal.project_id,
      projectName: (t.project_name as string) ?? 'Unknown',
      lastOutput: outputText,
      eventAge: ageSeconds,
    });
  }

  return results;
}

/**
 * Build CEO heartbeat summary.
 */
function buildHeartbeat(
  cycleAutoResponses: number,
  cycleBlocked: number,
  cycleSkipped: number,
): GangaHeartbeat {
  // Active agents (working)
  const agentCount = db.prepare(
    `SELECT COUNT(*) as n FROM agents WHERE status = 'working'`
  ).get() as Row;

  // Working projects (have active agents)
  const projectRows = db.prepare(`
    SELECT DISTINCT p.name
    FROM projects p
    JOIN agents a ON a.project_id = p.id
    WHERE a.status = 'working'
  `).all() as Row[];

  // 24h stats from ganga_log
  const stats = getGangaStats();

  return {
    activeAgents: (agentCount.n as number) ?? 0,
    workingProjects: projectRows.map(r => r.name as string),
    autoResponses: stats.autoResponses + cycleAutoResponses,
    blockedPrompts: stats.blocked + cycleBlocked,
    skippedPrompts: stats.skipped + cycleSkipped,
    lastCheck: new Date().toISOString(),
  };
}
