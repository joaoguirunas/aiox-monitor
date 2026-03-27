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

function formatRelativeTime(baseDate: string, eventDate: string): string {
  const base = parseUTC(baseDate).getTime();
  const ev = parseUTC(eventDate).getTime();
  const diffSec = Math.max(0, Math.floor((ev - base) / 1000));
  if (diffSec < 60) return `+${diffSec}s`;
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `+${mins}m${secs > 0 ? `${secs}s` : ''}`;
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

  const toolEvents = events.filter(
    (e) => e.type === 'PreToolUse' && e.tool,
  );

  const statusConfig = session.status === 'completed'
    ? { label: 'Completo', color: 'bg-accent-emerald/15 text-accent-emerald border-accent-emerald/25', dot: 'bg-accent-emerald' }
    : session.status === 'interrupted'
      ? { label: 'Interrompida', color: 'bg-red-500/15 text-red-400 border-red-500/25', dot: 'bg-red-400' }
      : { label: 'Em curso', color: 'bg-accent-amber/15 text-accent-amber border-accent-amber/25', dot: 'bg-accent-amber animate-pulse' };

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
        className="fixed inset-y-0 right-0 w-full max-w-xl bg-surface-1 border-l border-border z-50 overflow-y-auto flex flex-col shadow-drawer animate-slide-in-right"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-violet" />
              <h2 className="text-[13px] font-semibold text-text-primary font-display">Sessão</h2>
              <span className="text-[10px] text-text-muted font-mono">#{session.id}</span>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium rounded-full border ${statusConfig.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
                {statusConfig.label}
              </span>
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
          <div className="flex items-center gap-2 flex-wrap">
            {agent && <AgentBadge name={agent.name} displayName={agent.display_name} />}
            {project && (
              <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded bg-surface-3/60 text-text-secondary border border-border/30">
                {project.name}
              </span>
            )}
            <span className={`font-mono text-xs font-medium ${session.status === 'active' ? 'text-accent-amber' : 'text-text-primary'}`}>
              {formatDuration(session.started_at, session.ended_at)}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-5 space-y-6 flex-1">
          {/* Metadata chips */}
          <div className="flex flex-wrap gap-2">
            {terminal && (
              <span className="inline-flex items-center gap-1.5 bg-surface-0/60 border border-border/30 rounded-lg px-3 py-1.5 text-xs text-text-secondary">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${terminal.status === 'processing' ? 'bg-accent-emerald animate-pulse' : terminal.status === 'active' ? 'bg-accent-amber' : 'bg-text-muted/40'}`} />
                {terminal.window_title || `PID ${terminal.pid}`}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 bg-surface-0/60 border border-border/30 rounded-lg px-3 py-1.5 text-xs text-text-secondary">
              {fullDate}
            </span>
            <span className="inline-flex items-center gap-1.5 bg-surface-0/60 border border-border/30 rounded-lg px-3 py-1.5 text-xs text-text-secondary">
              {session.event_count} eventos
            </span>
          </div>

          {/* Prompt */}
          {session.prompt && (
            <div>
              <label className="block text-2xs font-medium text-text-muted uppercase tracking-widest mb-3">
                Prompt do Utilizador
              </label>
              <div className="rounded-lg overflow-hidden border border-accent-violet/20 bg-accent-violet/[0.04]">
                <div className="w-full h-[3px] bg-accent-violet/30" />
                <pre className="text-xs p-4 whitespace-pre-wrap break-all text-text-primary leading-relaxed max-h-[200px] overflow-y-auto">
                  {session.prompt}
                </pre>
              </div>
            </div>
          )}

          {/* Tools Timeline */}
          {loadingEvents ? (
            <div>
              <label className="block text-2xs font-medium text-text-muted uppercase tracking-widest mb-3">
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
              <label className="block text-2xs font-medium text-text-muted uppercase tracking-widest mb-3">
                Ações ({session.tool_count})
              </label>
              <div className="max-h-[300px] overflow-y-auto">
                {toolEvents.map((e, idx) => (
                  <div
                    key={e.id}
                    className={`flex items-start gap-2.5 py-2 px-2 ${idx % 2 === 1 ? 'bg-surface-0/30' : ''}`}
                  >
                    {/* Timestamp column */}
                    <span className="shrink-0 w-12 text-[10px] font-mono text-text-muted text-right pt-0.5">
                      {formatRelativeTime(session.started_at, e.created_at)}
                    </span>
                    {/* Timeline connector */}
                    <div className="relative flex flex-col items-center shrink-0 pt-1">
                      <span className="w-2 h-2 rounded-full bg-accent-blue/40 border-2 border-accent-blue/60 z-10" />
                      {idx < toolEvents.length - 1 && (
                        <div className="w-0.5 bg-border/20 absolute top-3 bottom-[-12px]" />
                      )}
                    </div>
                    {/* Tool badge + input */}
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-mono bg-accent-blue/10 text-accent-blue rounded">
                        {e.tool}
                      </span>
                      <span className="text-[11px] text-text-secondary truncate pt-0.5">
                        {humanizeTool(e.tool, e.input_summary)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Response */}
          {session.response && (
            <div>
              <label className="block text-2xs font-medium text-text-muted uppercase tracking-widest mb-3">
                Resposta do Claude
              </label>
              <div className="rounded-lg overflow-hidden border border-accent-emerald/20 bg-accent-emerald/[0.04]">
                <div className="w-full h-[3px] bg-accent-emerald/30" />
                <pre className="text-2xs p-3 whitespace-pre-wrap break-all text-text-primary leading-relaxed max-h-[300px] overflow-y-auto">
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
