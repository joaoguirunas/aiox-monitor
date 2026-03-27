'use client';

import { useState, useMemo } from 'react';
import type { Event, EventFilters, SessionWithSummary } from '@/lib/types';
import { PIXELLAB_SPRITES } from '@/game/data/pixellab-sprites';
import { getAgentColor } from '@/lib/constants';
import { useEvents } from '@/hooks/useEvents';
import { useSessions } from '@/hooks/useSessions';
import { useProjects } from '@/hooks/useProjects';
import { useAgents } from '@/hooks/useAgents';
import { useTerminals } from '@/hooks/useTerminals';
import { useProjectContext } from '@/contexts/ProjectContext';
import { TimeAgo } from '@/components/shared/TimeAgo';
import { SessionDetail } from '@/components/lista/SessionDetail';
import { EventDetail } from '@/components/lista/EventDetail';
import type { AgentWithStats } from '@/lib/types';

interface ListaPanelProps {
  collapsed: boolean;
  onToggle: () => void;
}

// ─── Session Card (replaces table row) ─────────────────────────────────────

function SessionCard({ session, onClick, agentData, projectName }: {
  session: SessionWithSummary; onClick: () => void; agentData?: AgentWithStats; projectName?: string;
}) {
  const agentName = (session.agent_name && session.agent_name !== '@unknown')
    ? session.agent_name
    : session.terminal_agent_name ?? session.agent_name;
  const agentDisplay = (session.agent_name && session.agent_name !== '@unknown')
    ? session.agent_display_name
    : session.terminal_agent_display_name ?? session.agent_display_name;

  const promptText = session.prompt
    ? session.prompt.length > 100 ? session.prompt.slice(0, 100) + '...' : session.prompt
    : null;

  const isActive = session.status === 'active';
  const isProcessing = session.terminal_status === 'processing';

  const statusDot = isProcessing
    ? 'bg-emerald-400 animate-pulse'
    : session.terminal_status === 'active'
      ? 'bg-amber-400'
      : 'bg-zinc-500/40';

  const hasAgent = agentName && agentName !== '@unknown';
  const agentColor = hasAgent ? getAgentColor(agentName) : '#4a5272';
  const spritePath = hasAgent ? PIXELLAB_SPRITES[agentName!]?.directions.south : undefined;
  const agentLabel = agentDisplay ?? agentName ?? '';
  const agentInitial = agentLabel.charAt(0).toUpperCase();
  const roleText = agentData?.role || undefined;

  const ringClass = isProcessing
    ? 'ring-2 ring-emerald-400/50 animate-pulse'
    : isActive
      ? 'ring-2 ring-accent-blue/40'
      : '';

  // Status badge
  const statusBadge = isActive ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-accent-amber/10 text-accent-amber border border-accent-amber/20 animate-pulse shrink-0">
      Em curso
    </span>
  ) : session.status === 'completed' ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
      Completo
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20 shrink-0">
      Interrompida
    </span>
  );

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left px-3 py-2.5 rounded-lg border transition-all duration-150
        hover:shadow-sm hover:shadow-black/5
        ${isActive
          ? 'bg-surface-1/60 border-accent-blue/20 hover:border-accent-blue/40'
          : 'bg-surface-1/30 border-border/30 hover:border-border/60'
        }
      `}
    >
      {/* Row 1: [Avatar] | Agent+Role | Janela | Projeto | Status | Time */}
      <div className="flex items-center gap-2.5">
        {/* Avatar */}
        {spritePath ? (
          <span
            className={`flex items-center justify-center w-9 h-9 rounded-full overflow-hidden border-2 shrink-0 ${ringClass}`}
            style={{ borderColor: agentColor }}
          >
            <img src={spritePath} alt={agentLabel} className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} />
          </span>
        ) : (
          <span
            className={`flex items-center justify-center w-9 h-9 rounded-full text-[11px] font-bold text-white/90 shrink-0 ${ringClass}`}
            style={{ backgroundColor: agentColor }}
          >
            {hasAgent ? agentInitial : '⚡'}
          </span>
        )}

        {/* Agent + Role */}
        <div className="min-w-[90px] max-w-[110px] shrink-0">
          {hasAgent ? (
            <>
              <span className="block text-[12px] font-semibold truncate" style={{ color: agentColor }}>
                {agentLabel}
              </span>
              {roleText && (
                <span className="block text-[9px] text-text-muted/60 truncate">{roleText}</span>
              )}
            </>
          ) : (
            <span className="block text-[11px] text-text-muted truncate">—</span>
          )}
        </div>

        {/* Janela (terminal title) */}
        <div className="flex-1 min-w-0">
          {session.terminal_title ? (
            <span className="flex items-center gap-1.5 text-[11px] text-text-secondary truncate">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`} />
              <span className="truncate">{session.terminal_title}</span>
            </span>
          ) : (
            <span className="text-[10px] text-text-muted/30">—</span>
          )}
          {/* Inline tool detail for active sessions */}
          {isActive && session.terminal_current_tool_detail && (
            <span className="flex items-center gap-1 mt-0.5 text-[9px] font-mono text-accent-blue/70 truncate">
              {session.terminal_waiting_permission === 1 && (
                <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse shrink-0" />
              )}
              <span className="truncate">{session.terminal_current_tool_detail}</span>
            </span>
          )}
        </div>

        {/* Projeto */}
        {projectName && (
          <span className="w-[90px] shrink-0 text-[10px] text-text-muted truncate text-right">
            {projectName}
          </span>
        )}

        {/* Status + Time */}
        <div className="flex items-center gap-2 shrink-0">
          {statusBadge}
          <TimeAgo dateStr={session.started_at} />
        </div>
      </div>

      {/* Row 2: Prompt (if any) — indented past avatar */}
      {promptText && (
        <p className="text-[10px] leading-relaxed text-text-secondary/70 mt-1 ml-[46px] line-clamp-1">
          {promptText}
        </p>
      )}

      {/* Row 3: Tool detail for non-active sessions */}
      {!isActive && session.terminal_current_tool_detail && (
        <div className="mt-1 ml-[46px] flex items-center gap-1 text-[9px] font-mono text-accent-blue/70 truncate">
          {session.terminal_waiting_permission === 1 && (
            <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse shrink-0" />
          )}
          <span className="truncate">{session.terminal_current_tool_detail}</span>
        </div>
      )}

      {/* Tool count (discrete) */}
      {session.tool_count > 0 && (
        <span className="block text-[9px] text-text-muted/30 mt-0.5 ml-[46px]">{session.tool_count} ações</span>
      )}
    </button>
  );
}

// ─── Main Panel ─────────────────────────────────────────────────────────────

export function ListaPanel({ collapsed, onToggle }: ListaPanelProps) {
  const [filters, setFilters] = useState<EventFilters>({ limit: 30 });
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionWithSummary | null>(null);
  const { selectedProjectId, setSelectedProjectId } = useProjectContext();

  const effectiveFilters: EventFilters = {
    ...filters,
    projectId: selectedProjectId ?? filters.projectId,
  };

  const {
    sessions,
    loading: sessionsLoading,
    loadingMore,
    hasMore,
    loadMore,
    refresh,
  } = useSessions({
    projectId: effectiveFilters.projectId,
    agentId: effectiveFilters.agentId,
    terminalId: effectiveFilters.terminalId,
    search: effectiveFilters.search,
  });

  const { projects } = useProjects();
  const { agents } = useAgents(effectiveFilters.projectId);
  const { terminals } = useTerminals(effectiveFilters.projectId);

  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const agentByName = new Map(agents.map((a) => [a.name, a]));
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  // Search with debounce
  const [searchInput, setSearchInput] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  const handleSearch = (value: string) => {
    setSearchInput(value);
    clearTimeout((handleSearch as unknown as { timer?: ReturnType<typeof setTimeout> }).timer);
    (handleSearch as unknown as { timer?: ReturnType<typeof setTimeout> }).timer = setTimeout(() => {
      setSearchDebounced(value);
      setFilters(f => ({ ...f, search: value || undefined }));
    }, 300);
  };

  if (collapsed) return null;

  // Active sessions first
  const sorted = [...sessions].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (a.status !== 'active' && b.status === 'active') return 1;
    return 0;
  });

  const activeSessions = sorted.filter(s => s.status === 'active');
  const pastSessions = sorted.filter(s => s.status !== 'active');

  return (
    <div className="h-full flex flex-col bg-surface-0/95 border-l border-border/30 overflow-hidden backdrop-blur-sm">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/20 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-accent-blue animate-pulse" />
            <h2 className="text-[13px] font-semibold text-text-primary font-display tracking-tight">
              Activity Feed
            </h2>
          </div>
          {!sessionsLoading && (
            <span className="text-[10px] text-text-muted/60 bg-surface-3/30 px-2 py-0.5 rounded-full">
              {sessions.length} sessoes
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={sessionsLoading}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-3/40 transition-colors disabled:opacity-30"
            title="Atualizar"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 11-6.219-8.56" />
              <polyline points="21 3 21 9 15 9" />
            </svg>
          </button>
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-3/40 transition-colors"
            title="Recolher painel"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="px-5 py-3 border-b border-border/10 shrink-0">
        <div className="relative">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Pesquisar sessoes..."
            className="w-full bg-surface-1/40 border border-border/30 text-text-secondary text-[12px] rounded-lg pl-9 pr-3 py-2 hover:border-border/60 focus:outline-none focus:border-accent-blue/40 focus:ring-1 focus:ring-accent-blue/10 transition-all placeholder:text-text-muted/30"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {/* Loading */}
        {sessionsLoading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-4 rounded-xl border border-border/20 bg-surface-1/20">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-5 w-16 shimmer rounded-full" />
                  <div className="h-3 w-24 shimmer rounded" />
                </div>
                <div className="h-3 shimmer rounded w-full mb-2" />
                <div className="h-3 shimmer rounded w-3/4" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!sessionsLoading && sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-10 h-10 rounded-full bg-surface-3/30 flex items-center justify-center mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-text-muted/40">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-[13px] text-text-secondary font-medium">Nenhuma sessao</p>
            <p className="text-[11px] text-text-muted/50 mt-1">Inicie o Claude Code para ver atividade</p>
          </div>
        )}

        {/* Active Sessions */}
        {activeSessions.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-blue animate-pulse" />
              <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">
                Em curso ({activeSessions.length})
              </h3>
            </div>
            <div className="space-y-1.5">
              {activeSessions.map((s) => (
                <SessionCard key={s.id} session={s} onClick={() => setSelectedSession(s)} agentData={agentByName.get(s.terminal_agent_name ?? s.agent_name ?? '')} projectName={projectMap.get(s.project_id)?.name} />
              ))}
            </div>
          </section>
        )}

        {/* Past Sessions */}
        {pastSessions.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3 px-1">
              <h3 className="text-[10px] font-semibold text-text-muted/60 uppercase tracking-widest">
                Recentes ({pastSessions.length})
              </h3>
            </div>
            <div className="space-y-1.5">
              {pastSessions.map((s) => (
                <SessionCard key={s.id} session={s} onClick={() => setSelectedSession(s)} agentData={agentByName.get(s.terminal_agent_name ?? s.agent_name ?? '')} projectName={projectMap.get(s.project_id)?.name} />
              ))}
            </div>
          </section>
        )}

        {/* Load more */}
        {hasMore && !sessionsLoading && (
          <div className="flex justify-center pt-2 pb-4">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="px-5 py-2 text-[11px] font-medium text-text-muted hover:text-text-secondary rounded-lg border border-border/40 hover:border-border/70 transition-all disabled:opacity-40"
            >
              {loadingMore ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border border-text-muted/40 border-t-text-muted rounded-full animate-spin" />
                  A carregar...
                </span>
              ) : (
                'Carregar mais'
              )}
            </button>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      <SessionDetail
        session={selectedSession}
        agents={agents}
        projects={projects}
        terminals={terminals}
        onClose={() => setSelectedSession(null)}
      />
    </div>
  );
}
