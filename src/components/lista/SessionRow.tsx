import { useState, useEffect } from 'react';
import type { Event, AgentWithStats, Project, Terminal, SessionWithSummary } from '@/lib/types';
import { AgentBadge } from '@/components/shared/Badge';
import { TimeAgo } from '@/components/shared/TimeAgo';

function parseUTC(dateStr: string): Date {
  const normalized = dateStr.endsWith('Z') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  return new Date(normalized);
}

function formatDuration(startedAt: string, endedAt?: string | null): string {
  const start = parseUTC(startedAt).getTime();
  const end = endedAt ? parseUTC(endedAt).getTime() : Date.now();
  const ms = end - start;
  if (ms < 0) return '—';
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${mins}m ${secs}s`;
}

// ─── Legacy groupBySession (kept as fallback, AC9) ──────────────────────────

export interface SessionGroup {
  sessionId: number | null;
  prompt: string | null;
  response: string | null;
  tools: string[];
  toolCount: number;
  agentId: number | null;
  terminalId: number | null;
  projectId: number;
  startedAt: string;
  events: Event[];
  isComplete: boolean;
}

/** Group events into sessions (legacy client-side grouping) */
export function groupBySession(events: Event[]): SessionGroup[] {
  const map = new Map<string, Event[]>();

  for (const e of events) {
    const key = e.session_id != null ? String(e.session_id) : `orphan-${e.id}`;
    const arr = map.get(key);
    if (arr) arr.push(e);
    else map.set(key, [e]);
  }

  const groups: SessionGroup[] = [];

  for (const [, evts] of map) {
    evts.sort((a, b) => a.id - b.id);

    const promptEvt = evts.find((e) => e.type === 'UserPromptSubmit');
    const stopEvt = [...evts].reverse().find((e) => e.type === 'Stop' || e.type === 'SubagentStop');

    const toolSet = new Set<string>();
    let toolCount = 0;
    for (const e of evts) {
      if (e.tool && (e.type === 'PreToolUse' || e.type === 'PostToolUse')) {
        toolSet.add(e.tool);
        if (e.type === 'PreToolUse') toolCount++;
      }
    }

    const agentId = promptEvt?.agent_id ?? stopEvt?.agent_id ?? evts[0]?.agent_id ?? null;
    const terminalId = promptEvt?.terminal_id ?? stopEvt?.terminal_id ?? evts[0]?.terminal_id ?? null;

    groups.push({
      sessionId: evts[0]?.session_id ?? null,
      prompt: promptEvt?.input_summary ?? null,
      response: stopEvt?.input_summary ?? null,
      tools: [...toolSet],
      toolCount,
      agentId,
      terminalId,
      projectId: evts[0]?.project_id ?? 0,
      startedAt: evts[0]?.created_at ?? '',
      events: evts,
      isComplete: !!stopEvt,
    });
  }

  return groups;
}

// ─── SessionRow (renders SessionWithSummary from API) ───────────────────────

interface SessionRowProps {
  session: SessionWithSummary;
  agents: AgentWithStats[];
  projects: Project[];
  terminals: Terminal[];
  onClick: () => void;
}

export function SessionRow({ session, onClick }: SessionRowProps) {
  // Use enriched server-side data directly — no client-side cross-referencing needed
  // Agent: prefer session agent if known, fall back to terminal's agent
  const effectiveAgentName = (session.agent_name && session.agent_name !== '@unknown')
    ? session.agent_name
    : session.terminal_agent_name ?? session.agent_name;
  const effectiveAgentDisplay = (session.agent_name && session.agent_name !== '@unknown')
    ? session.agent_display_name
    : session.terminal_agent_display_name ?? session.agent_display_name;

  // Detect skill: from server enrichment, or from prompt slash command
  const skill = session.skill
    ?? (session.prompt?.match(/^\/([a-zA-Z0-9_-]+)/)?.[1] || undefined);

  // Live duration for active sessions — refresh every 30s
  const [, setTick] = useState(0);
  useEffect(() => {
    if (session.status !== 'active') return;
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, [session.status]);

  const promptText = session.prompt
    ? session.prompt.length > 90 ? session.prompt.slice(0, 90) + '…' : session.prompt
    : '—';

  const responsePreview = session.response
    ? session.response.length > 80 ? session.response.slice(0, 80) + '…' : session.response
    : null;

  const statusBadge = session.status === 'completed' ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-accent-emerald/10 text-accent-emerald border-accent-emerald/20">
      Completo
    </span>
  ) : session.status === 'interrupted' ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-red-500/10 text-red-400 border-red-500/20">
      Interrompida
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-accent-amber/10 text-accent-amber border-accent-amber/20 animate-pulse">
      Em curso
    </span>
  );

  const terminalDot = session.terminal_status === 'processing'
    ? 'bg-accent-emerald animate-pulse'
    : session.terminal_status === 'active'
      ? 'bg-accent-amber'
      : 'bg-text-muted/40';

  return (
    <tr
      className="border-b border-border/20 hover:bg-white/[0.02] cursor-pointer transition-colors duration-150 group"
      onClick={onClick}
    >
      <td className="px-4 py-2.5 whitespace-nowrap">
        <TimeAgo dateStr={session.started_at} />
      </td>
      <td className="px-4 py-2.5 text-[13px] text-text-secondary truncate">
        {session.project_name ?? <span className="text-text-muted">—</span>}
      </td>
      <td className="px-4 py-2.5">
        {effectiveAgentName && effectiveAgentName !== '@unknown' ? (
          <AgentBadge name={effectiveAgentName} displayName={effectiveAgentDisplay} />
        ) : skill ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-accent-blue/10 text-accent-blue border-accent-blue/20">
            /{skill}
          </span>
        ) : (
          <span className="text-text-muted text-[13px]">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        {session.terminal_title ? (
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${terminalDot}`} />
              <span className="truncate max-w-[120px]">{session.terminal_title}</span>
            </span>
            {session.terminal_current_tool_detail && (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-accent-blue truncate max-w-[180px]">
                {session.terminal_waiting_permission === 1 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                )}
                {session.terminal_current_tool_detail}
              </span>
            )}
            {!session.terminal_current_tool_detail && session.terminal_waiting_permission === 1 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Aguardando permissão
              </span>
            )}
          </div>
        ) : (
          <span className="text-text-muted text-[11px]">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        {session.terminal_pid ? (
          <span className="text-[10px] font-mono text-text-muted">{session.terminal_pid}</span>
        ) : (
          <span className="text-text-muted text-[10px]">—</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <div className="text-[13px] text-accent-violet/80 truncate">{promptText}</div>
        {responsePreview && (
          <div className="text-2xs text-accent-emerald/60 truncate mt-0.5">{responsePreview}</div>
        )}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap gap-1">
          {session.tools.slice(0, 5).map((t) => (
            <span key={t} className="px-1.5 py-0.5 text-[10px] font-mono bg-surface-3/60 text-text-muted rounded">
              {t}
            </span>
          ))}
          {session.tools.length > 5 && (
            <span className="px-1.5 py-0.5 text-[10px] font-mono text-text-muted">
              +{session.tools.length - 5}
            </span>
          )}
        </div>
        <div className="text-[10px] text-text-muted mt-0.5">{session.tool_count} ações</div>
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        <span className={`text-[11px] font-mono ${session.status === 'active' ? 'text-accent-amber' : 'text-text-muted'}`}>
          {formatDuration(session.started_at, session.ended_at)}
        </span>
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        {statusBadge}
      </td>
    </tr>
  );
}
