'use client';

import { useEffect, useState } from 'react';
import type { Event, AgentWithStats, Project, Terminal, SessionWithSummary } from '@/lib/types';
import { AgentBadge } from '@/components/shared/Badge';

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

interface SessionDetailProps {
  session: SessionWithSummary | null;
  agents: AgentWithStats[];
  projects: Project[];
  terminals: Terminal[];
  onClose: () => void;
}

function parseUTC(dateStr: string): Date {
  const normalized = dateStr.endsWith('Z') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  return new Date(normalized);
}

export function SessionDetail({ session, agents, projects, terminals, onClose }: SessionDetailProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Fetch events on-demand when session is selected
  useEffect(() => {
    if (!session) {
      setEvents([]);
      return;
    }

    setLoadingEvents(true);
    fetch(`/api/sessions/${session.id}/events`)
      .then((r) => r.json())
      .then((data: { events: Event[] }) => {
        setEvents(data.events ?? []);
        setLoadingEvents(false);
      })
      .catch(() => {
        setLoadingEvents(false);
      });
  }, [session?.id]);

  useEffect(() => {
    if (!session) return;
    document.body.style.overflow = 'hidden';
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handler);
    };
  }, [session, onClose]);

  if (!session) return null;

  const agent = session.agent_id ? agents.find((a) => a.id === session.agent_id) : undefined;
  const project = projects.find((p) => p.id === session.project_id);
  const terminal = session.terminal_id ? terminals.find((t) => t.id === session.terminal_id) : undefined;
  const fullDate = parseUTC(session.started_at).toLocaleString('pt-BR');

  // Build timeline from fetched events
  const toolEvents = events.filter(
    (e) => e.type === 'PreToolUse' && e.tool,
  );

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
        className="fixed inset-y-0 right-0 w-full max-w-lg bg-surface-1 border-l border-border z-50 overflow-y-auto flex flex-col shadow-drawer animate-slide-in-right"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-violet" />
            <h2 className="text-[13px] font-semibold text-text-primary font-display">Sessão</h2>
            <span className="text-[10px] text-text-muted font-mono">#{session.id}</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3/60 transition-colors"
            aria-label="Fechar"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-5 space-y-5 flex-1">
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Início">{fullDate}</Field>
            <Field label="Fim">
              {session.ended_at
                ? parseUTC(session.ended_at).toLocaleString('pt-BR')
                : <span className="text-accent-amber text-xs">Em curso</span>}
            </Field>
            <Field label="Duração">
              <span className={`font-mono text-xs ${session.status === 'active' ? 'text-accent-amber' : 'text-text-primary'}`}>
                {formatDuration(session.started_at, session.ended_at)}
              </span>
            </Field>
            <Field label="Projeto">{project?.name ?? '—'}</Field>
            <Field label="Agente">
              {agent ? (
                <AgentBadge name={agent.name} displayName={agent.display_name} />
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </Field>
            <Field label="Terminal">
              {terminal ? (
                <div>
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${terminal.status === 'processing' ? 'bg-accent-emerald animate-pulse' : terminal.status === 'active' ? 'bg-accent-amber' : 'bg-text-muted/40'}`} />
                    {terminal.window_title || `PID ${terminal.pid}`}
                  </span>
                  {terminal.window_title && (
                    <div className="text-[10px] text-text-muted font-mono mt-0.5">PID {terminal.pid}</div>
                  )}
                </div>
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </Field>
            <Field label="Status">
              {session.status === 'completed' ? (
                <span className="text-accent-emerald text-xs font-medium">Completo</span>
              ) : session.status === 'interrupted' ? (
                <span className="text-red-400 text-xs font-medium">Interrompida</span>
              ) : (
                <span className="text-accent-amber text-xs font-medium">Em curso</span>
              )}
            </Field>
            <Field label="Eventos">{session.event_count}</Field>
          </div>

          {/* Prompt */}
          {session.prompt && (
            <div>
              <label className="block text-2xs font-medium text-text-muted uppercase tracking-widest mb-2">
                Prompt do Utilizador
              </label>
              <div className="rounded-lg overflow-hidden border border-accent-violet/20 bg-accent-violet/[0.04]">
                <div className="w-full h-[3px] bg-accent-violet/30" />
                <pre className="text-2xs p-3 overflow-x-auto whitespace-pre-wrap break-all text-text-primary leading-relaxed">
                  {session.prompt}
                </pre>
              </div>
            </div>
          )}

          {/* Tools Timeline */}
          {loadingEvents ? (
            <div>
              <label className="block text-2xs font-medium text-text-muted uppercase tracking-widest mb-2">
                Ações
              </label>
              <div className="space-y-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5 px-2">
                    <div className="h-4 w-12 shimmer rounded" />
                    <div className="h-3 shimmer rounded flex-1" />
                  </div>
                ))}
              </div>
            </div>
          ) : toolEvents.length > 0 ? (
            <div>
              <label className="block text-2xs font-medium text-text-muted uppercase tracking-widest mb-2">
                Ações ({session.tool_count})
              </label>
              <div className="space-y-1 max-h-[250px] overflow-y-auto">
                {toolEvents.map((e) => (
                  <div key={e.id} className="flex items-start gap-2 py-1.5 px-2 rounded bg-surface-0/50">
                    <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-mono bg-accent-blue/10 text-accent-blue rounded">
                      {e.tool}
                    </span>
                    <span className="text-[11px] text-text-secondary truncate">
                      {humanizeTool(e.tool, e.input_summary)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Response */}
          {session.response && (
            <div>
              <label className="block text-2xs font-medium text-text-muted uppercase tracking-widest mb-2">
                Resposta do Claude
              </label>
              <div className="rounded-lg overflow-hidden border border-accent-emerald/20 bg-accent-emerald/[0.04]">
                <div className="w-full h-[3px] bg-accent-emerald/30" />
                <pre className="text-2xs p-3 overflow-x-auto whitespace-pre-wrap break-all text-text-primary leading-relaxed">
                  {session.response}
                </pre>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-2xs font-medium text-text-muted uppercase tracking-widest mb-1">{label}</dt>
      <dd className="text-[13px] text-text-primary">{children}</dd>
    </div>
  );
}
