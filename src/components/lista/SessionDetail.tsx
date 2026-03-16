'use client';

import { useEffect } from 'react';
import type { AgentWithStats, Project, Terminal } from '@/lib/types';
import { AgentBadge } from '@/components/shared/Badge';
import type { SessionGroup } from './SessionRow';

interface SessionDetailProps {
  session: SessionGroup | null;
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

  const agent = session.agentId ? agents.find((a) => a.id === session.agentId) : undefined;
  const project = projects.find((p) => p.id === session.projectId);
  const terminal = session.terminalId ? terminals.find((t) => t.id === session.terminalId) : undefined;
  const fullDate = parseUTC(session.startedAt).toLocaleString('pt-BR');

  // Build timeline from events
  const toolEvents = session.events.filter(
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
            <Field label="Timestamp">{fullDate}</Field>
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
                <span className="inline-flex items-center gap-1.5 text-xs font-mono">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${terminal.status === 'processing' ? 'bg-accent-emerald animate-pulse' : terminal.status === 'active' ? 'bg-accent-amber' : 'bg-text-muted/40'}`} />
                  PID {terminal.pid}
                </span>
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </Field>
            <Field label="Status">
              {session.isComplete ? (
                <span className="text-accent-emerald text-xs font-medium">Completo</span>
              ) : (
                <span className="text-accent-amber text-xs font-medium">Em curso</span>
              )}
            </Field>
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
          {toolEvents.length > 0 && (
            <div>
              <label className="block text-2xs font-medium text-text-muted uppercase tracking-widest mb-2">
                Ações ({session.toolCount})
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
          )}

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
