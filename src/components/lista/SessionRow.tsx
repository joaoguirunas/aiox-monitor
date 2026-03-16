import type { Event, AgentWithStats, Project, Terminal } from '@/lib/types';
import { AgentBadge } from '@/components/shared/Badge';
import { TimeAgo } from '@/components/shared/TimeAgo';

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

/** Group events into sessions */
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
    // Sort oldest first within session
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

    // Find first agent that isn't @unknown
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

interface SessionRowProps {
  session: SessionGroup;
  agents: AgentWithStats[];
  projects: Project[];
  terminals: Terminal[];
  onClick: () => void;
}

export function SessionRow({ session, agents, projects, terminals, onClick }: SessionRowProps) {
  const agent = session.agentId ? agents.find((a) => a.id === session.agentId) : undefined;
  const project = projects.find((p) => p.id === session.projectId);
  const terminal = session.terminalId ? terminals.find((t) => t.id === session.terminalId) : undefined;

  const promptText = session.prompt
    ? session.prompt.length > 90 ? session.prompt.slice(0, 90) + '…' : session.prompt
    : '—';

  const responsePreview = session.response
    ? session.response.length > 80 ? session.response.slice(0, 80) + '…' : session.response
    : null;

  return (
    <tr
      className="border-b border-border/20 hover:bg-white/[0.02] cursor-pointer transition-colors duration-150 group"
      onClick={onClick}
    >
      <td className="px-4 py-2.5 whitespace-nowrap">
        <TimeAgo dateStr={session.startedAt} />
      </td>
      <td className="px-4 py-2.5 text-[13px] text-text-secondary truncate">
        {project?.name ?? <span className="text-text-muted">—</span>}
      </td>
      <td className="px-4 py-2.5">
        {agent ? (
          <AgentBadge name={agent.name} displayName={agent.display_name} />
        ) : (
          <span className="text-text-muted text-[13px]">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        {terminal ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary" title={`PID ${terminal.pid}${terminal.window_title ? ` — ${terminal.window_title}` : ''}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${terminal.status === 'processing' ? 'bg-accent-emerald animate-pulse' : terminal.status === 'active' ? 'bg-accent-amber' : 'bg-text-muted/40'}`} />
            <span className="truncate max-w-[120px]">{terminal.window_title || `PID ${terminal.pid}`}</span>
          </span>
        ) : (
          <span className="text-text-muted text-[11px]">—</span>
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
        <div className="text-[10px] text-text-muted mt-0.5">{session.toolCount} ações</div>
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        {session.isComplete ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-accent-emerald/10 text-accent-emerald border-accent-emerald/20">
            Completo
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-accent-amber/10 text-accent-amber border-accent-amber/20 animate-pulse">
            Em curso
          </span>
        )}
      </td>
    </tr>
  );
}
