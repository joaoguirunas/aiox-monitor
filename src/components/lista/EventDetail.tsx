'use client';

import { useEffect } from 'react';
import type { Event } from '@/lib/types';
import { EventTypeBadge, AgentBadge } from '@/components/shared/Badge';

interface EventDetailProps {
  event: Event | null;
  agentName?: string | null;
  agentDisplayName?: string | null;
  projectName?: string;
  onClose: () => void;
}

export function EventDetail({
  event,
  agentName,
  agentDisplayName,
  projectName,
  onClose,
}: EventDetailProps) {
  useEffect(() => {
    if (!event) return;
    document.body.style.overflow = 'hidden';
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handler);
    };
  }, [event, onClose]);

  if (!event) return null;

  const utcStr = event.created_at.endsWith('Z') ? event.created_at : event.created_at.replace(' ', 'T') + 'Z';
  const fullDate = new Date(utcStr).toLocaleString('pt-BR');

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-label="Detalhes do evento"
        aria-modal="true"
        className="fixed inset-y-0 right-0 w-full max-w-md bg-surface-1 border-l border-border z-50 overflow-y-auto flex flex-col shadow-drawer animate-slide-in-right"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-orange" />
            <h2 className="text-[13px] font-semibold text-text-primary font-display">Detalhes do Evento</h2>
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
          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Timestamp">{fullDate}</Field>
            <Field label="Event ID">
              <span className="font-mono text-text-muted">#{event.id}</span>
            </Field>
            <Field label="Projeto">{projectName ?? '—'}</Field>
            <Field label="Tool">
              <span className="font-mono text-accent-orange/70">{event.tool ?? '—'}</span>
            </Field>
          </div>

          {/* Agent & Type */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Agente">
              {agentName ? (
                <AgentBadge name={agentName} displayName={agentDisplayName} />
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </Field>
            <Field label="Tipo">
              <EventTypeBadge type={event.type} />
            </Field>
          </div>

          {event.duration_ms !== undefined && event.duration_ms !== null && (
            <Field label="Duração">
              <span className="font-mono text-accent-amber">{event.duration_ms}ms</span>
            </Field>
          )}

          {/* Input */}
          {event.input_summary && (
            <div>
              <label className="block text-2xs font-medium text-text-muted uppercase tracking-widest mb-2">
                {inputLabel(event.type)}
              </label>
              <div className={`rounded-lg overflow-hidden border ${
                event.type === 'UserPromptSubmit'
                  ? 'border-accent-violet/20 bg-accent-violet/[0.04]'
                  : isStopEvent(event.type)
                    ? 'border-accent-emerald/20 bg-accent-emerald/[0.04]'
                    : 'border-border bg-surface-0'
              }`}>
                <div className={`w-full h-[3px] ${
                  event.type === 'UserPromptSubmit'
                    ? 'bg-accent-violet/30'
                    : isStopEvent(event.type)
                      ? 'bg-accent-emerald/30'
                      : 'bg-accent-orange/20'
                }`} />
                <pre className={`text-2xs p-3 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed ${
                  event.type === 'UserPromptSubmit' || isStopEvent(event.type)
                    ? 'text-text-primary'
                    : 'font-mono text-text-secondary'
                }`}>
                  {event.input_summary}
                </pre>
              </div>
            </div>
          )}

          {/* Output */}
          {event.output_summary && (
            <div>
              <label className="block text-2xs font-medium text-text-muted uppercase tracking-widest mb-2">
                {outputLabel(event.type)}
              </label>
              <div className={`rounded-lg overflow-hidden border ${
                isStopEvent(event.type)
                  ? 'border-accent-emerald/20 bg-accent-emerald/[0.04]'
                  : 'border-border bg-surface-0'
              }`}>
                <div className="w-full h-[3px] bg-accent-emerald/20" />
                <pre className={`text-2xs p-3 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed ${
                  isStopEvent(event.type) ? 'text-text-primary' : 'font-mono text-text-secondary'
                }`}>
                  {event.output_summary}
                </pre>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function isStopEvent(type: string): boolean {
  return type === 'Stop' || type === 'SubagentStop';
}

function inputLabel(type: string): string {
  if (type === 'UserPromptSubmit') return 'Prompt do Usuário';
  if (type === 'PreToolUse') return 'Comando da Tool';
  if (type === 'PostToolUse') return 'Input da Tool';
  if (isStopEvent(type)) return 'Resposta do Claude';
  return 'Input';
}

function outputLabel(type: string): string {
  if (type === 'PostToolUse') return 'Resultado da Tool';
  if (isStopEvent(type)) return 'Resposta Completa';
  return 'Output';
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-2xs font-medium text-text-muted uppercase tracking-widest mb-1">{label}</dt>
      <dd className="text-[13px] text-text-primary">{children}</dd>
    </div>
  );
}
