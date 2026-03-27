'use client';

import { useEffect, useRef, useState } from 'react';
import type { Event, AgentWithStats, Project, Terminal, SessionWithSummary } from '@/lib/types';
import { PIXELLAB_SPRITES } from '@/game/data/pixellab-sprites';

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function formatRelativeTime(baseDate: string, eventDate: string): string {
  const base = parseUTC(baseDate).getTime();
  const ev = parseUTC(eventDate).getTime();
  const diffSec = Math.max(0, Math.floor((ev - base) / 1000));
  if (diffSec < 60) return `+${diffSec}s`;
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `+${mins}m${secs > 0 ? `${secs.toString().padStart(2, '0')}s` : ''}`;
}

const TOOL_COLORS: Record<string, string> = {
  Read: 'bg-accent-violet/10 text-accent-violet',
  Write: 'bg-accent-emerald/10 text-accent-emerald',
  Edit: 'bg-accent-emerald/10 text-accent-emerald',
  Bash: 'bg-accent-amber/10 text-accent-amber',
  Grep: 'bg-accent-blue/10 text-accent-blue',
  Glob: 'bg-accent-blue/10 text-accent-blue',
  Agent: 'bg-purple-500/10 text-purple-400',
  Skill: 'bg-purple-500/10 text-purple-400',
};

function getToolColor(tool: string | null | undefined): string {
  if (!tool) return 'bg-surface-3 text-text-muted';
  return TOOL_COLORS[tool] ?? 'bg-surface-3 text-text-secondary';
}

const AGENT_COLORS: Record<string, string> = {
  '@dev': '#6366f1', '@qa': '#34d399', '@architect': '#a78bfa',
  '@pm': '#fb923c', '@sm': '#22d3ee', '@po': '#fbbf24',
  '@analyst': '#818cf8', '@devops': '#f87171', '@data-engineer': '#f472b6',
  '@ux-design-expert': '#e879f9', '@aiox-master': '#fbbf24',
};

function humanizeTool(tool: string | null | undefined, input: string | null | undefined): string {
  if (!tool || !input) return '—';
  const short = (s: string, max = 60) => s.length > max ? s.slice(0, max) + '…' : s;
  switch (tool) {
    case 'Read': return short(input.replace(/^\/.*\//, '…/'), 70);
    case 'Write': return short(input.replace(/^\/.*\//, '…/'), 70);
    case 'Edit': return short(input.replace(/^\/.*\//, '…/'), 70);
    case 'Bash': return short(input, 70);
    case 'Grep': return `"${short(input, 50)}"`;
    case 'Glob': return short(input, 50);
    case 'Agent': return 'Sub-agente';
    case 'Skill': return short(input, 50);
    default: return short(input, 70);
  }
}

/** Minimal markdown-ish rendering: `code` and **bold** */
function renderSimpleMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const m = match[0];
    if (m.startsWith('`')) {
      parts.push(
        <code key={key++} className="px-1 py-0.5 rounded bg-surface-3/60 text-accent-blue text-[10px] font-mono">
          {m.slice(1, -1)}
        </code>
      );
    } else {
      parts.push(<strong key={key++} className="font-semibold text-text-primary">{m.slice(2, -2)}</strong>);
    }
    lastIndex = match.index + m.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

interface GroupedEvent {
  tool: string;
  count: number;
  input: string;
  timestamp: string;
  ids: number[];
}

function groupConsecutiveTools(evts: Event[]): GroupedEvent[] {
  const groups: GroupedEvent[] = [];
  for (const e of evts) {
    const last = groups[groups.length - 1];
    if (last && last.tool === e.tool && last.tool === 'Read') {
      last.count++;
      last.ids.push(e.id);
    } else {
      groups.push({
        tool: e.tool ?? '?',
        count: 1,
        input: humanizeTool(e.tool, e.input_summary),
        timestamp: e.created_at,
        ids: [e.id],
      });
    }
  }
  return groups;
}

// ─── Component ──────────────────────────────────────────────────────────────

interface SessionDetailProps {
  session: SessionWithSummary | null;
  agents: AgentWithStats[];
  projects: Project[];
  terminals: Terminal[];
  onClose: () => void;
}

export function SessionDetail({ session, agents, projects, terminals, onClose }: SessionDetailProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!session) { setEvents([]); return; }
    setLoadingEvents(true);
    fetch(`/api/sessions/${session.id}/events`)
      .then((r) => r.json())
      .then((data: { events: Event[] }) => {
        setEvents(data.events ?? []);
        setLoadingEvents(false);
      })
      .catch(() => setLoadingEvents(false));
  }, [session?.id]);

  // Auto-scroll timeline to bottom for active sessions
  useEffect(() => {
    if (session?.status === 'active' && timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [events, session?.status]);

  useEffect(() => {
    if (!session) return;
    document.body.style.overflow = 'hidden';
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', handler); };
  }, [session, onClose]);

  if (!session) return null;

  const isActive = session.status === 'active';
  const agentName = session.terminal_agent_name ?? session.agent_name ?? null;
  const agentDisplay = session.terminal_agent_display_name ?? session.agent_display_name ?? agentName;
  const agent = session.agent_id ? agents.find((a) => a.id === session.agent_id) : undefined;
  const project = projects.find((p) => p.id === session.project_id);
  const terminal = session.terminal_id ? terminals.find((t) => t.id === session.terminal_id) : undefined;
  const agentColor = AGENT_COLORS[agentName ?? ''] ?? '#4a5272';

  const spritePath = agentName ? PIXELLAB_SPRITES[agentName]?.directions.south : undefined;
  const currentToolDetail = terminal?.current_tool_detail ?? session.terminal_current_tool_detail;
  const waitingPermission = terminal?.waiting_permission === 1 || session.terminal_waiting_permission === 1;

  const toolEvents = events.filter((e) => e.type === 'PreToolUse' && e.tool);
  const grouped = groupConsecutiveTools(toolEvents);

  const statusConfig = session.status === 'completed'
    ? { label: 'Completo', bg: 'bg-accent-emerald/15 text-accent-emerald border-accent-emerald/25', dot: 'bg-accent-emerald' }
    : session.status === 'interrupted'
      ? { label: 'Interrompida', bg: 'bg-red-500/15 text-red-400 border-red-500/25', dot: 'bg-red-400' }
      : { label: 'Em curso', bg: 'bg-accent-amber/15 text-accent-amber border-accent-amber/25', dot: 'bg-accent-amber animate-pulse' };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        role="dialog"
        aria-label="Detalhes da sessão"
        aria-modal="true"
        className="fixed inset-y-0 right-0 w-full max-w-2xl bg-surface-1 border-l border-border z-50 overflow-y-auto flex flex-col shadow-drawer animate-slide-in-right"
      >
        {/* ── Close button ── */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3/60 transition-colors z-10"
          aria-label="Fechar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* ── 1. HERO SECTION ── */}
        <div className="px-6 pt-6 pb-5 border-b border-border">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="relative shrink-0">
              {spritePath ? (
                <div
                  className={`w-14 h-14 rounded-full overflow-hidden border-2 bg-surface-0 ${isActive ? 'ring-2 ring-accent-emerald/60 ring-offset-2 ring-offset-surface-1' : ''}`}
                  style={{ borderColor: agentColor }}
                >
                  <img
                    src={spritePath}
                    alt={agentDisplay ?? 'Agent'}
                    className="w-full h-full object-cover"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </div>
              ) : (
                <div
                  className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white/90 ${isActive ? 'ring-2 ring-accent-emerald/60 ring-offset-2 ring-offset-surface-1' : ''}`}
                  style={{ backgroundColor: agentColor }}
                >
                  {(agentDisplay ?? '?').charAt(0).toUpperCase()}
                </div>
              )}
              {isActive && (
                <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-accent-emerald border-2 border-surface-1 animate-pulse" />
              )}
            </div>

            {/* Agent info */}
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold text-text-primary font-display leading-tight">
                  {agentDisplay ?? 'Agente'}
                </h2>
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium rounded-full border ${statusConfig.bg}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
                  {statusConfig.label}
                </span>
              </div>
              {agentName && agentName !== agentDisplay && (
                <span className="text-xs text-text-muted font-mono">{agentName}</span>
              )}
              {isActive && (
                <div className="text-[11px] text-accent-emerald font-medium mt-1">Trabalhando agora</div>
              )}
              {project && (
                <span className="inline-flex items-center px-2 py-0.5 mt-1.5 text-[10px] font-medium rounded bg-surface-3/60 text-text-secondary border border-border/30">
                  {project.name}
                </span>
              )}
            </div>
          </div>

          {/* Current tool detail (active sessions) */}
          {isActive && currentToolDetail && (
            <div className="mt-4 p-3 rounded-xl bg-accent-blue/10 border border-accent-blue/15">
              <div className="text-[10px] text-accent-blue/70 uppercase tracking-widest font-medium mb-1">A executar</div>
              <div className="text-sm font-mono text-accent-blue leading-relaxed">{currentToolDetail}</div>
            </div>
          )}

          {/* Waiting permission warning */}
          {waitingPermission && (
            <div className="mt-3 flex items-center gap-2 p-2.5 rounded-lg bg-accent-amber/10 border border-accent-amber/20">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-amber shrink-0">
                <path d="M12 9v4m0 4h.01M12 2L2 22h20L12 2z" />
              </svg>
              <span className="text-xs text-accent-amber font-medium">Aguardando permissão</span>
            </div>
          )}
        </div>

        {/* ── 2. PROGRESS BAR ── */}
        <div className="px-6 py-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            {/* Start */}
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-accent-violet border-2 border-accent-violet/30" />
              <span className="text-[10px] text-text-muted">Início</span>
            </div>
            <div className="flex-1 h-px bg-border/40 relative">
              <div
                className={`absolute inset-y-0 left-0 ${isActive ? 'bg-accent-emerald/40' : session.status === 'completed' ? 'bg-accent-emerald/30' : 'bg-red-400/30'}`}
                style={{ width: '100%' }}
              />
            </div>
            {/* Actions count */}
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-accent-blue border-2 border-accent-blue/30" />
              <span className="text-[10px] text-text-muted">{session.tool_count ?? toolEvents.length} ações</span>
            </div>
            <div className="flex-1 h-px bg-border/40" />
            {/* End status */}
            <div className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${statusConfig.dot} border-2 ${session.status === 'completed' ? 'border-accent-emerald/30' : session.status === 'interrupted' ? 'border-red-400/30' : 'border-accent-amber/30'}`} />
              <span className="text-[10px] text-text-muted">{statusConfig.label}</span>
            </div>
            {/* Duration */}
            <span className={`ml-2 text-xs font-mono font-semibold ${isActive ? 'text-accent-amber' : 'text-text-primary'}`}>
              {formatDuration(session.started_at, session.ended_at)}
            </span>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="px-6 py-5 space-y-6 flex-1">

          {/* ── 3. PROMPT ── */}
          {session.prompt && (
            <div>
              <label className="block text-2xs font-medium text-text-muted uppercase tracking-widest mb-3">
                Prompt do Utilizador
              </label>
              <div className="flex gap-3">
                <div className="shrink-0 mt-1">
                  <div className="w-7 h-7 rounded-full bg-accent-violet/15 flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-violet">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                </div>
                <div className="flex-1 rounded-lg overflow-hidden border border-accent-violet/20 bg-accent-violet/[0.04] relative">
                  <div className="w-full h-[3px] bg-accent-violet/30" />
                  <pre className="text-xs p-4 whitespace-pre-wrap break-all text-text-primary leading-relaxed max-h-[180px] overflow-y-auto">
                    {session.prompt}
                  </pre>
                  {/* Gradient fade for long prompts */}
                  <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-surface-1/80 to-transparent pointer-events-none" />
                </div>
              </div>
            </div>
          )}

          {/* ── 4. TIMELINE ── */}
          {loadingEvents ? (
            <div>
              <label className="block text-2xs font-medium text-text-muted uppercase tracking-widest mb-3">
                Ações
              </label>
              <div className="space-y-2 pl-4 border-l-2 border-border/20 ml-[52px]">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5 px-2">
                    <div className="h-4 w-12 shimmer rounded" />
                    <div className="h-3 shimmer rounded flex-1" />
                  </div>
                ))}
              </div>
            </div>
          ) : grouped.length > 0 ? (
            <div>
              <label className="block text-2xs font-medium text-text-muted uppercase tracking-widest mb-3">
                Ações ({session.tool_count ?? toolEvents.length})
              </label>
              <div ref={timelineRef} className="max-h-[350px] overflow-y-auto">
                <div className="relative">
                  {grouped.map((g, idx) => (
                    <div key={g.ids[0]} className="flex items-start group">
                      {/* Timestamp */}
                      <span className="shrink-0 w-12 text-[10px] font-mono text-text-muted text-right pt-1.5 pr-3">
                        {formatRelativeTime(session.started_at, g.timestamp)}
                      </span>

                      {/* Timeline connector */}
                      <div className="relative flex flex-col items-center shrink-0">
                        <span className={`w-2.5 h-2.5 rounded-full border-2 z-10 mt-1.5 ${getToolColor(g.tool).replace(/\/10/, '/30').replace('text-', 'border-')} bg-surface-1`} />
                        {idx < grouped.length - 1 && (
                          <div className="w-0.5 flex-1 bg-accent-blue/20 min-h-[20px]" />
                        )}
                      </div>

                      {/* Content */}
                      <div className={`flex items-start gap-2 min-w-0 flex-1 ml-3 py-1.5 px-2.5 rounded-lg mb-1 ${idx % 2 === 1 ? 'bg-surface-0/30' : ''}`}>
                        <span className={`shrink-0 px-1.5 py-0.5 text-[10px] font-mono rounded ${getToolColor(g.tool)}`}>
                          {g.tool}{g.count > 1 ? ` (${g.count})` : ''}
                        </span>
                        <span className="text-[11px] text-text-secondary truncate pt-0.5">
                          {g.count > 1 ? `${g.count} ficheiros` : g.input}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {/* ── 5. RESPONSE ── */}
          {session.response && (
            <div>
              <label className="block text-2xs font-medium text-text-muted uppercase tracking-widest mb-3">
                Resposta do Claude
              </label>
              <div className="rounded-lg overflow-hidden border border-accent-emerald/20 bg-accent-emerald/[0.04]">
                <div className="w-full h-[3px] bg-accent-emerald/30" />
                <div className="text-2xs p-4 whitespace-pre-wrap break-all text-text-primary leading-relaxed max-h-[300px] overflow-y-auto">
                  {renderSimpleMarkdown(session.response)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── 6. FOOTER METADATA ── */}
        <div className="px-6 py-3 border-t border-border/50 bg-surface-0/30">
          <div className="flex items-center gap-1.5 text-[10px] text-text-muted flex-wrap">
            {terminal && (
              <>
                <span className="inline-flex items-center gap-1">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted">
                    <polyline points="4 17 10 11 4 5" />
                    <line x1="12" y1="19" x2="20" y2="19" />
                  </svg>
                  {terminal.window_title || `PID ${terminal.pid}`}
                </span>
                <span className="text-text-muted/40">·</span>
              </>
            )}
            {project && (
              <>
                <span>{project.name}</span>
                <span className="text-text-muted/40">·</span>
              </>
            )}
            <span className="font-mono">#{session.id}</span>
            <span className="text-text-muted/40">·</span>
            <span>{session.event_count} eventos</span>
          </div>
        </div>
      </aside>
    </>
  );
}
