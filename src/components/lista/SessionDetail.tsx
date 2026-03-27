'use client';

import { useEffect, useRef, useState } from 'react';
import type { Event, AgentWithStats, Project, Terminal, SessionWithSummary } from '@/lib/types';
import { PIXELLAB_SPRITES } from '@/game/data/pixellab-sprites';
import { getAgentColor as getAgentColorFromConstants } from '@/lib/constants';

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

const TOOL_COLORS: Record<string, { bg: string; text: string }> = {
  Read:  { bg: 'bg-accent-violet/8',  text: 'text-accent-violet' },
  Write: { bg: 'bg-accent-emerald/8', text: 'text-accent-emerald' },
  Edit:  { bg: 'bg-accent-emerald/8', text: 'text-accent-emerald' },
  Bash:  { bg: 'bg-accent-cyan/8',    text: 'text-accent-cyan' },
  Grep:  { bg: 'bg-accent-blue/8',    text: 'text-accent-blue' },
  Glob:  { bg: 'bg-accent-blue/8',    text: 'text-accent-blue' },
  Agent: { bg: 'bg-purple-500/8',     text: 'text-purple-400' },
  Skill: { bg: 'bg-purple-500/8',     text: 'text-purple-400' },
};

function getToolColor(tool: string | null | undefined) {
  if (!tool) return { bg: 'bg-white/[0.04]', text: 'text-[#505878]' };
  return TOOL_COLORS[tool] ?? { bg: 'bg-white/[0.04]', text: 'text-[#8892b0]' };
}

function humanizeTool(tool: string | null | undefined, input: string | null | undefined): string {
  if (!tool || !input) return '—';
  const short = (s: string, max = 60) => s.length > max ? s.slice(0, max) + '…' : s;
  switch (tool) {
    case 'Read': case 'Write': case 'Edit':
      return short(input.replace(/^\/.*\//, '…/'), 70);
    case 'Bash': return short(input, 70);
    case 'Grep': return `"${short(input, 50)}"`;
    case 'Glob': return short(input, 50);
    case 'Agent': return 'Sub-agente';
    case 'Skill': return short(input, 50);
    default: return short(input, 70);
  }
}

function renderSimpleMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const m = match[0];
    if (m.startsWith('`')) {
      parts.push(
        <code key={key++} className="px-1 py-0.5 rounded bg-white/[0.06] text-accent-blue text-[11px] font-mono">
          {m.slice(1, -1)}
        </code>
      );
    } else {
      parts.push(<strong key={key++} className="font-semibold text-[#c8cfe0]">{m.slice(2, -2)}</strong>);
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
  const agent = session.agent_id
    ? agents.find((a) => a.id === session.agent_id)
    : agentName ? agents.find((a) => a.name === agentName) : undefined;
  const project = projects.find((p) => p.id === session.project_id);
  const terminal = session.terminal_id ? terminals.find((t) => t.id === session.terminal_id) : undefined;
  const agentColor = getAgentColorFromConstants(agentName);
  const agentRoleTeam = agent ? [agent.role, agent.team].filter(Boolean).join(' · ') : '';

  const spritePath = agentName ? PIXELLAB_SPRITES[agentName]?.directions?.south : undefined;
  const currentToolDetail = terminal?.current_tool_detail ?? session.terminal_current_tool_detail;
  const waitingPermission = terminal?.waiting_permission === 1 || session.terminal_waiting_permission === 1;

  const toolEvents = events.filter((e) => e.type === 'PreToolUse' && e.tool);
  const grouped = groupConsecutiveTools(toolEvents);

  const statusConfig = session.status === 'completed'
    ? { label: 'Completo', color: 'text-emerald-400', bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400' }
    : session.status === 'interrupted'
      ? { label: 'Interrompida', color: 'text-red-400', bg: 'bg-red-500/10 text-red-400 border-red-500/20', dot: 'bg-red-400' }
      : { label: 'Em curso', color: 'text-accent-blue', bg: 'bg-accent-blue/10 text-accent-blue border-accent-blue/20', dot: 'bg-accent-blue animate-pulse' };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-label="Detalhes da sessao"
        aria-modal="true"
        className="fixed inset-y-0 right-0 w-full max-w-[640px] bg-[#0a0b10] border-l border-white/[0.06] z-50 flex flex-col shadow-drawer animate-slide-in-right"
      >
        {/* ── Header bar ── */}
        <div className="flex items-center justify-between px-6 h-[52px] shrink-0 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <span className="text-[12px] font-mono text-[#505878]">#{session.id}</span>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[10px] font-medium rounded-md border ${statusConfig.bg}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
              {statusConfig.label}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md text-[#505878] hover:text-[#c8cfe0] hover:bg-white/[0.04] transition-colors"
            aria-label="Fechar"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto">

          {/* ── 1. HERO ── */}
          <div className="px-6 py-5">
            <div className="flex items-center gap-4">
              {/* Avatar — circular */}
              <div className="relative shrink-0">
                {spritePath ? (
                  <div
                    className="w-[52px] h-[52px] border-2"
                    style={{
                      borderColor: agentColor,
                      background: agentColor + '15',
                      borderRadius: '50%',
                      overflow: 'hidden',
                      clipPath: 'circle(50%)',
                    }}
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
                    className="w-[52px] h-[52px] flex items-center justify-center text-lg font-bold text-white/90"
                    style={{
                      backgroundColor: agentColor,
                      borderRadius: '50%',
                    }}
                  >
                    {(agentDisplay ?? '?').charAt(0).toUpperCase()}
                  </div>
                )}
                {isActive && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-accent-blue border-2 border-[#0a0b10] animate-pulse" />
                )}
              </div>

              {/* Agent info */}
              <div className="flex-1 min-w-0">
                <h2 className="text-[16px] font-semibold text-[#c8cfe0] font-display leading-tight truncate">
                  {agentDisplay ?? 'Agente'}
                </h2>
                {agentRoleTeam && (
                  <span className="text-[12px] text-[#6b7394] mt-0.5 block">{agentRoleTeam}</span>
                )}
                {agentName && agentName !== agentDisplay && !agentRoleTeam && (
                  <span className="text-[11px] text-[#505878] font-mono block mt-0.5">{agentName}</span>
                )}
              </div>
            </div>

            {/* Metadata chips */}
            <div className="flex items-center gap-2 mt-4 flex-wrap">
              {project && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium rounded-md bg-white/[0.04] text-[#8892b0] border border-white/[0.06]">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#505878]">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {project.name}
                </span>
              )}
              {terminal && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium rounded-md bg-white/[0.04] text-[#8892b0] border border-white/[0.06]">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#505878]">
                    <polyline points="4 17 10 11 4 5" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="12" y1="19" x2="20" y2="19" strokeLinecap="round" />
                  </svg>
                  {terminal.window_title || `PID ${terminal.pid}`}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium rounded-md bg-white/[0.04] text-[#8892b0] border border-white/[0.06]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#505878]">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {formatDuration(session.started_at, session.ended_at)}
              </span>
              <span className="inline-flex items-center px-2.5 py-1 text-[10px] font-mono text-[#505878] rounded-md bg-white/[0.02] border border-white/[0.04]">
                {session.tool_count ?? toolEvents.length} acoes · {session.event_count} eventos
              </span>
            </div>
          </div>

          {/* ── Current tool (active) ── */}
          {isActive && currentToolDetail && (
            <div className="mx-6 mb-4 p-3.5 rounded-md bg-accent-blue/[0.06] border border-accent-blue/15">
              <div className="text-[9px] text-accent-blue/60 uppercase tracking-[0.14em] font-semibold mb-1.5">A executar</div>
              <div className="text-[12px] font-mono text-accent-blue/90 leading-relaxed break-all">{currentToolDetail}</div>
            </div>
          )}

          {/* ── Waiting permission ── */}
          {waitingPermission && (
            <div className="mx-6 mb-4 flex items-center gap-2.5 p-3 rounded-md bg-red-500/[0.06] border border-red-500/15">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400 shrink-0">
                <path d="M12 9v4m0 4h.01M12 2L2 22h20L12 2z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[11px] text-red-400 font-medium">Aguardando permissao</span>
            </div>
          )}

          {/* ── Prompt ── */}
          {session.prompt && (
            <div className="mx-6 mb-5">
              <label className="block text-[9px] font-semibold text-[#505878] uppercase tracking-[0.14em] mb-2.5">
                Prompt
              </label>
              <div className="rounded-md overflow-hidden border border-accent-violet/15 bg-accent-violet/[0.03] relative">
                <div className="w-full h-[2px] bg-accent-violet/25" />
                <pre className="text-[12px] p-4 whitespace-pre-wrap break-words text-[#c8cfe0] leading-relaxed max-h-[200px] overflow-y-auto font-sans">
                  {session.prompt}
                </pre>
                <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#0a0b10] to-transparent pointer-events-none" />
              </div>
            </div>
          )}

          {/* ── Timeline ── */}
          {loadingEvents ? (
            <div className="mx-6 mb-5">
              <label className="block text-[9px] font-semibold text-[#505878] uppercase tracking-[0.14em] mb-2.5">
                Acoes
              </label>
              <div className="space-y-2 ml-14 pl-4 border-l border-white/[0.06]">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5 px-2">
                    <div className="h-4 w-12 shimmer rounded" />
                    <div className="h-3 shimmer rounded flex-1" />
                  </div>
                ))}
              </div>
            </div>
          ) : grouped.length > 0 ? (
            <div className="mx-6 mb-5">
              <label className="block text-[9px] font-semibold text-[#505878] uppercase tracking-[0.14em] mb-2.5">
                Acoes ({session.tool_count ?? toolEvents.length})
              </label>
              <div ref={timelineRef} className="max-h-[400px] overflow-y-auto">
                <div className="relative">
                  {grouped.map((g, idx) => {
                    const tc = getToolColor(g.tool);
                    return (
                      <div key={g.ids[0]} className="flex items-start group">
                        {/* Timestamp */}
                        <span className="shrink-0 w-[48px] text-[10px] font-mono text-[#3d4462] text-right pt-[7px] pr-3">
                          {formatRelativeTime(session.started_at, g.timestamp)}
                        </span>

                        {/* Timeline line + dot */}
                        <div className="relative flex flex-col items-center shrink-0 w-3">
                          <span className={`w-[7px] h-[7px] rounded-full z-10 mt-[7px] ${tc.bg} border border-white/[0.08]`} style={{ backgroundColor: `color-mix(in srgb, currentColor 20%, transparent)` }} />
                          {idx < grouped.length - 1 && (
                            <div className="w-px flex-1 bg-white/[0.06] min-h-[18px]" />
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex items-center gap-2 min-w-0 flex-1 ml-2.5 py-[5px] px-2.5 rounded-md mb-0.5 hover:bg-white/[0.02] transition-colors">
                          <span className={`shrink-0 px-2 py-0.5 text-[10px] font-mono rounded-md ${tc.bg} ${tc.text}`}>
                            {g.tool}{g.count > 1 ? ` ×${g.count}` : ''}
                          </span>
                          <span className="text-[11px] text-[#8892b0] truncate">
                            {g.count > 1 ? `${g.count} ficheiros` : g.input}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {/* ── Response ── */}
          {session.response && (
            <div className="mx-6 mb-5">
              <label className="block text-[9px] font-semibold text-[#505878] uppercase tracking-[0.14em] mb-2.5">
                Resposta
              </label>
              <div className="rounded-md overflow-hidden border border-emerald-500/15 bg-emerald-500/[0.03] relative">
                <div className="w-full h-[2px] bg-emerald-500/25" />
                <div className="text-[12px] p-4 whitespace-pre-wrap break-words text-[#a8b8c8] leading-relaxed max-h-[300px] overflow-y-auto">
                  {renderSimpleMarkdown(session.response)}
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#0a0b10] to-transparent pointer-events-none" />
              </div>
            </div>
          )}

          {/* Bottom spacer */}
          <div className="h-4" />
        </div>
      </aside>
    </>
  );
}
