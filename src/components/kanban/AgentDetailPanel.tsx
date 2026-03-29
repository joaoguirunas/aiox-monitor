'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Agent, Event, SessionWithSummary, Terminal, WsEventNew, WsAgentUpdate } from '@/lib/types';
import { useWebSocket } from '@/hooks/useWebSocket';
import { AGENT_COLORS, STATUS_DOT } from '@/lib/constants';

interface AgentDetailPanelProps {
  agent: Agent;
  onClose: () => void;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hours}h ${remainMins}m`;
}

export function AgentDetailPanel({ agent, onClose }: AgentDetailPanelProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [session, setSession] = useState<SessionWithSummary | null>(null);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const { lastMessage } = useWebSocket();

  // Slide-in animation
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleClose]);

  // Fetch data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetchData = async () => {
      try {
        const [eventsRes, sessionsRes, terminalsRes] = await Promise.all([
          fetch(`/api/events?agent_id=${agent.id}&limit=10`),
          fetch(`/api/sessions?agent_id=${agent.id}&status=active&limit=1`),
          fetch(`/api/terminals?project_id=${agent.project_id}`),
        ]);

        if (cancelled) return;

        const eventsData = await eventsRes.json();
        const sessionsData = await sessionsRes.json();
        const terminalsData = await terminalsRes.json();

        if (cancelled) return;

        setEvents(Array.isArray(eventsData) ? eventsData : eventsData.data ?? []);
        const sessionsList = Array.isArray(sessionsData) ? sessionsData : sessionsData.data ?? [];
        setSession(sessionsList.length > 0 ? sessionsList[0] : null);
        const allTerminals: Terminal[] = terminalsData.terminals ?? [];
        const agentTerminal = allTerminals.find(
          (t: Terminal) => t.agent_name === agent.name && t.status !== 'inactive'
        ) ?? null;
        setTerminal(agentTerminal);
      } catch {
        // silent — show empty states
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [agent.id, agent.name, agent.project_id]);

  // Real-time: new events
  useEffect(() => {
    if (!lastMessage) return;
    if (lastMessage.type === 'event:new') {
      const msg = lastMessage as WsEventNew;
      if (msg.agentId === agent.id) {
        setEvents(prev => [msg.event, ...prev].slice(0, 10));
      }
    }
    if (lastMessage.type === 'agent:update') {
      const msg = lastMessage as WsAgentUpdate;
      if (msg.agent.id === agent.id) {
        // Agent data is managed by parent — we just update terminal-related display
      }
    }
  }, [lastMessage, agent.id]);

  const agentColor = AGENT_COLORS[agent.name] ?? '#FF4400';
  const displayName = agent.display_name ?? agent.name;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label={`Detalhes de ${displayName}`}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        className={`relative w-[400px] max-w-full h-full bg-surface-0 border-l border-border/40 shadow-xl overflow-y-auto transition-transform duration-200 ${visible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="sticky top-0 bg-surface-0 border-b border-border/30 px-5 py-4 flex items-center gap-3">
          <span
            className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg text-sm font-bold text-white/90"
            style={{ backgroundColor: agentColor }}
          >
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-text-primary truncate">{displayName}</p>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[agent.status]}`} />
            </div>
            <p className="text-[11px] text-text-muted truncate">{agent.name} · {agent.status}</p>
          </div>
          <button
            onClick={handleClose}
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-surface-2/60 transition-colors"
            aria-label="Fechar"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="px-5 py-8 space-y-4">
            <div className="h-4 shimmer rounded w-32" />
            <div className="h-3 shimmer rounded w-48" />
            <div className="h-3 shimmer rounded w-40" />
            <div className="h-4 shimmer rounded w-32 mt-6" />
            <div className="h-3 shimmer rounded w-56" />
          </div>
        ) : (
          <div className="divide-y divide-border/20">
            {/* Terminal Section */}
            <section className="px-5 py-4">
              <h3 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-3">Terminal</h3>
              {terminal ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-text-muted">PID</span>
                    <span className="text-[12px] text-text-primary font-mono">{terminal.pid}</span>
                  </div>
                  {terminal.window_title && (
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-text-muted">Título</span>
                      <span className="text-[12px] text-text-primary truncate max-w-[220px]" title={terminal.window_title}>{terminal.window_title}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-text-muted">Status</span>
                    <span className="text-[12px] text-text-primary">{terminal.status}</span>
                  </div>
                  {terminal.current_tool_detail && (
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-text-muted">Tool</span>
                      <span className="text-[12px] text-text-primary font-mono truncate max-w-[220px]" title={terminal.current_tool_detail}>
                        {terminal.current_tool_detail}
                      </span>
                    </div>
                  )}
                  {terminal.waiting_permission === 1 && (
                    <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-400/15 text-amber-400 animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      Aguarda permissão
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-text-muted/50">Sem dados disponíveis</p>
              )}
            </section>

            {/* Session Section */}
            <section className="px-5 py-4">
              <h3 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-3">Sessão Activa</h3>
              {session ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-text-muted">Duração</span>
                    <span className="text-[12px] text-text-primary">{formatDuration(session.started_at)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-text-muted">Eventos</span>
                    <span className="text-[12px] text-text-primary">{session.event_count}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-text-muted">Status</span>
                    <span className="text-[12px] text-text-primary">{session.status}</span>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-text-muted/50">Sem dados disponíveis</p>
              )}
            </section>

            {/* Events Section */}
            <section className="px-5 py-4">
              <h3 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-3">Eventos Recentes</h3>
              {events.length > 0 ? (
                <div className="space-y-1.5">
                  {events.map(evt => (
                    <div key={evt.id} className="flex items-start gap-2 py-1.5 px-2 rounded-md hover:bg-surface-2/30 transition-colors">
                      <span className="text-[10px] text-text-muted font-mono flex-shrink-0 pt-0.5 w-10">
                        {formatTime(evt.created_at)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="text-[11px] text-text-primary font-medium">
                          {evt.tool ?? evt.type}
                        </span>
                        {evt.input_summary && (
                          <p className="text-[10px] text-text-muted truncate" title={evt.input_summary}>
                            {evt.input_summary}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-text-muted/50">Sem dados disponíveis</p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
