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

  const fullDate = new Date(event.created_at).toLocaleString('pt-BR');

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-label="Detalhes do evento"
        aria-modal="true"
        className="fixed inset-y-0 right-0 w-full max-w-md bg-gray-900 border-l border-gray-700 z-50 overflow-y-auto flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-100">Detalhes do Evento</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 text-xl leading-none"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <dl className="px-5 py-4 space-y-4 text-sm flex-1">
          <Row label="Timestamp">{fullDate}</Row>
          <Row label="Projeto">{projectName ?? '—'}</Row>
          <Row label="Agente">
            {agentName ? (
              <AgentBadge name={agentName} displayName={agentDisplayName} />
            ) : (
              <span className="text-gray-500">—</span>
            )}
          </Row>
          <Row label="Tipo">
            <EventTypeBadge type={event.type} />
          </Row>
          <Row label="Tool">{event.tool ?? '—'}</Row>
          {event.duration_ms !== undefined && event.duration_ms !== null && (
            <Row label="Duração">{event.duration_ms} ms</Row>
          )}
          {event.input_summary && (
            <Row label="Input">
              <pre className="text-xs text-gray-300 bg-gray-800 p-2 rounded overflow-x-auto whitespace-pre-wrap break-all">
                {event.input_summary}
              </pre>
            </Row>
          )}
          {event.output_summary && (
            <Row label="Output">
              <pre className="text-xs text-gray-300 bg-gray-800 p-2 rounded overflow-x-auto whitespace-pre-wrap break-all">
                {event.output_summary}
              </pre>
            </Row>
          )}
          <Row label="Event ID">#{event.id}</Row>
        </dl>
      </aside>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</dt>
      <dd className="text-gray-200">{children}</dd>
    </div>
  );
}
