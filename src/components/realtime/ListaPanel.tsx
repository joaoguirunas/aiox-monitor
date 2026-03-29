'use client';

import { useState, useEffect, useCallback } from 'react';
import type { EventFilters, SessionWithSummary } from '@/lib/types';
import { PIXELLAB_SPRITES } from '@/game/data/pixellab-sprites';
import { getAgentColor } from '@/lib/constants';
import { useSessions } from '@/hooks/useSessions';
import { useProjects } from '@/hooks/useProjects';
import { useAgents } from '@/hooks/useAgents';
import { useTerminals } from '@/hooks/useTerminals';
import { useProjectContext } from '@/contexts/ProjectContext';
import { SessionDetail } from '@/components/lista/SessionDetail';
import type { AgentWithStats } from '@/lib/types';

interface ListaPanelProps {
  collapsed: boolean;
  onToggle: () => void;
}

// ─── Time helpers (UTC-aware) ────────────────────────────────────────────────

function parseUTC(dateStr: string): Date {
  const normalized = dateStr.endsWith('Z') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  return new Date(normalized);
}

function timeAgo(dateStr: string): string {
  const s = Math.max(0, Math.floor((Date.now() - parseUTC(dateStr).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function liveTimer(dateStr: string): string {
  const s = Math.max(0, Math.floor((Date.now() - parseUTC(dateStr).getTime()) / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ─── Live Timer Hook ─────────────────────────────────────────────────────────

function useTick(enabled: boolean, intervalMs = 1000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick(t => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs]);
}

// ─── Brandbook Table: Session Row ────────────────────────────────────────────
// Follows: font-mono 0.65rem, padding 0.75rem 1.25rem, hover accent-02

function SessionRow({ session, onClick, agentData, projectName }: {
  session: SessionWithSummary; onClick: () => void; agentData?: AgentWithStats; projectName?: string;
}) {
  const agentName = (session.agent_name && session.agent_name !== '@unknown')
    ? session.agent_name
    : session.terminal_agent_name ?? session.agent_name;
  const agentDisplay = (session.agent_name && session.agent_name !== '@unknown')
    ? session.agent_display_name
    : session.terminal_agent_display_name ?? session.agent_display_name;

  const isActive = session.status === 'active';
  const isProcessing = session.terminal_status === 'processing';

  const hasAgent = agentName && agentName !== '@unknown';
  const agentColor = hasAgent ? getAgentColor(agentName) : '#3D3D3D';
  const spritePath = hasAgent ? PIXELLAB_SPRITES[agentName!]?.directions?.south : undefined;
  const agentLabel = agentDisplay ?? agentName ?? '—';
  const agentInitial = agentLabel.charAt(0).toUpperCase();
  const roleText = agentData?.role ?? '—';
  const teamText = agentData?.team ?? '—';

  let command = '';
  if (isActive && session.terminal_current_tool_detail) {
    command = session.terminal_current_tool_detail;
  } else if (session.prompt) {
    const firstLine = session.prompt.split('\n')[0];
    command = firstLine.length > 55 ? firstLine.slice(0, 55) + '…' : firstLine;
  }

  const isPermWait = session.terminal_waiting_permission === 1;

  return (
    <tr
      onClick={onClick}
      className={`
        cursor-pointer transition-colors duration-100 group border-b border-border
        ${isActive
          ? 'bg-surface-1 hover:bg-surface-2'
          : 'hover:bg-surface-1/50'
        }
      `}
    >
      {/* Avatar */}
      <td className="py-2 pl-5 pr-2 w-[44px]">
        {spritePath ? (
          <div
            className="w-[28px] h-[28px] shrink-0 border"
            style={{
              borderColor: agentColor + '40',
              background: agentColor + '12',
              borderRadius: '50%',
              overflow: 'hidden',
              clipPath: 'circle(50%)',
            }}
          >
            <img
              src={spritePath}
              alt={agentLabel}
              className="w-full h-full object-cover"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
        ) : (
          <div
            className="w-[28px] h-[28px] shrink-0 flex items-center justify-center text-[10px] font-bold text-white/90"
            style={{ backgroundColor: hasAgent ? agentColor : '#161618', borderRadius: '50%' }}
          >
            {hasAgent ? agentInitial : '⚡'}
          </div>
        )}
      </td>

      {/* Agente */}
      <td className="py-3 px-5 font-mono text-[0.65rem] whitespace-nowrap">
        <span className="font-medium" style={{ color: hasAgent ? agentColor : 'rgba(244,244,232,0.4)' }}>
          {agentLabel}
        </span>
      </td>

      {/* Role */}
      <td className="py-3 px-5 font-mono text-[0.65rem] text-text-secondary whitespace-nowrap">
        {roleText}
      </td>

      {/* Squad */}
      <td className="py-3 px-5 font-mono text-[0.65rem] text-text-tertiary whitespace-nowrap">
        {teamText}
      </td>

      {/* Janela */}
      <td className="py-3 px-5 font-mono text-[0.65rem] whitespace-nowrap">
        <span className="flex items-center gap-1.5">
          <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${
            isProcessing ? 'bg-accent-emerald animate-pulse' : session.terminal_status === 'active' ? 'bg-accent-amber' : 'bg-surface-5/50'
          }`} />
          <span className="text-text-secondary truncate max-w-[80px]">
            {session.terminal_title ?? '—'}
          </span>
        </span>
      </td>

      {/* Projeto */}
      <td className="py-3 px-5 font-mono text-[0.65rem] text-text-tertiary whitespace-nowrap">
        {projectName ?? '—'}
      </td>

      {/* Comando */}
      <td className="py-3 px-5 font-mono text-[0.65rem] whitespace-nowrap max-w-[200px] truncate">
        <span className={isActive && session.terminal_current_tool_detail ? 'text-accent-orange/80' : 'text-text-muted'}>
          {isPermWait && (
            <span className="inline-block w-[5px] h-[5px] rounded-full bg-accent-amber animate-pulse mr-1.5 align-middle" />
          )}
          {command || '—'}
        </span>
      </td>

      {/* Tempo */}
      <td className="py-3 px-5 font-mono text-[0.65rem] text-right tabular-nums whitespace-nowrap">
        <span className={isActive ? 'text-accent-orange/70' : 'text-text-muted'}>
          {isActive ? liveTimer(session.started_at) : timeAgo(session.started_at)}
        </span>
      </td>
    </tr>
  );
}

// ─── Brandbook Table: Column Header ──────────────────────────────────────────
// Follows: font-mono 0.55rem, weight 500, uppercase, 0.08em tracking
// bg: surface (#0F0F11), color: dim (rgba(245,244,231,0.4)), padding 0.75rem 1.25rem

function ColHeader() {
  return (
    <thead className="sticky top-0 z-10">
      <tr className="bg-surface-2 border-b border-border">
        <th className="py-3 pl-5 pr-2 w-[44px]" />
        <th className="py-3 px-5 text-left font-mono text-[0.55rem] font-medium text-text-muted uppercase tracking-[0.08em] whitespace-nowrap">Agente</th>
        <th className="py-3 px-5 text-left font-mono text-[0.55rem] font-medium text-text-muted uppercase tracking-[0.08em] whitespace-nowrap">Role</th>
        <th className="py-3 px-5 text-left font-mono text-[0.55rem] font-medium text-text-muted uppercase tracking-[0.08em] whitespace-nowrap">Squad</th>
        <th className="py-3 px-5 text-left font-mono text-[0.55rem] font-medium text-text-muted uppercase tracking-[0.08em] whitespace-nowrap">Janela</th>
        <th className="py-3 px-5 text-left font-mono text-[0.55rem] font-medium text-text-muted uppercase tracking-[0.08em] whitespace-nowrap">Projeto</th>
        <th className="py-3 px-5 text-left font-mono text-[0.55rem] font-medium text-text-muted uppercase tracking-[0.08em] whitespace-nowrap">Comando</th>
        <th className="py-3 px-5 w-[60px]" />
      </tr>
    </thead>
  );
}

// ─── Filter Bar ─────────────────────────────────────────────────────────────
// Brandbook input: font-mono 0.7rem, bg surface, border, focus brand

function FilterBar({ projects, terminals, filters, onFilterChange, searchInput, onSearch }: {
  projects: { id: number; name: string }[];
  terminals: { id: number; window_title?: string; pid: number; agent_name?: string }[];
  filters: EventFilters;
  onFilterChange: (f: Partial<EventFilters>) => void;
  searchInput: string;
  onSearch: (value: string) => void;
}) {
  const activeTerminals = terminals.filter(t => t.window_title || t.agent_name);

  return (
    <div className="px-5 py-3 shrink-0 flex flex-wrap items-center gap-3 border-b border-border">
      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Pesquisar..."
          className="input w-[160px] pl-8 pr-3 py-1.5 font-mono text-[0.7rem]"
        />
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {/* Separator */}
      {projects.length > 0 && <div className="w-px h-5 bg-border" />}

      {/* Project badges */}
      {projects.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => onFilterChange({ projectId: undefined })}
            className={`badge transition-colors ${!filters.projectId ? 'badge-brand' : 'badge-neutral hover:badge-brand'}`}
          >
            Todos
          </button>
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => onFilterChange({ projectId: filters.projectId === p.id ? undefined : p.id })}
              className={`badge transition-colors ${filters.projectId === p.id ? 'badge-brand' : 'badge-neutral hover:badge-brand'}`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* Terminal filter */}
      {activeTerminals.length > 1 && (
        <>
          <div className="w-px h-5 bg-border" />
          <select
            value={filters.terminalId ?? ''}
            onChange={(e) => onFilterChange({ terminalId: e.target.value ? Number(e.target.value) : undefined })}
            className="input py-1.5 font-mono text-[0.7rem] cursor-pointer appearance-none pr-7 w-auto"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23696969' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
          >
            <option value="">Todos terminais</option>
            {activeTerminals.map(t => (
              <option key={t.id} value={t.id}>
                {t.window_title || t.agent_name || `PID ${t.pid}`}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}

// ─── Main Panel ─────────────────────────────────────────────────────────────

export function ListaPanel({ collapsed, onToggle }: ListaPanelProps) {
  const [filters, setFilters] = useState<EventFilters>({ limit: 30 });
  const [selectedSession, setSelectedSession] = useState<SessionWithSummary | null>(null);
  const { selectedProjectId } = useProjectContext();

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

  const agentByName = new Map(agents.map((a) => [a.name, a]));
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const hasActive = sessions.some(s => s.status === 'active');
  useTick(hasActive);

  const [searchInput, setSearchInput] = useState('');
  const handleSearch = useCallback((value: string) => {
    setSearchInput(value);
    clearTimeout((handleSearch as unknown as { timer?: ReturnType<typeof setTimeout> }).timer);
    (handleSearch as unknown as { timer?: ReturnType<typeof setTimeout> }).timer = setTimeout(() => {
      setFilters(f => ({ ...f, search: value || undefined }));
    }, 300);
  }, []);

  const handleFilterChange = useCallback((partial: Partial<EventFilters>) => {
    setFilters(f => ({ ...f, ...partial }));
  }, []);

  if (collapsed) return null;

  const sorted = [...sessions].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (a.status !== 'active' && b.status === 'active') return 1;
    return 0;
  });
  const activeSessions = sorted.filter(s => s.status === 'active');
  const pastSessions = sorted.filter(s => s.status !== 'active');

  return (
    <div className="h-full flex flex-col bg-surface-0 border-l border-border overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 h-12 shrink-0 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-[6px] h-[6px] rounded-full bg-accent-orange animate-pulse" />
            <h2 className="font-mono text-[0.55rem] font-medium text-text-muted uppercase tracking-[0.08em]">
              Activity Feed
            </h2>
          </div>
          {!sessionsLoading && (
            <span className="font-mono text-[0.55rem] text-text-muted tabular-nums bg-surface-2 px-2 py-0.5 rounded border border-border">
              {sessions.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={refresh}
            disabled={sessionsLoading}
            className="w-7 h-7 flex items-center justify-center rounded text-text-muted hover:text-text-secondary hover:bg-white/[0.04] transition-colors disabled:opacity-20"
            title="Atualizar"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 11-6.219-8.56" /><polyline points="21 3 21 9 15 9" />
            </svg>
          </button>
          <button
            onClick={onToggle}
            className="w-7 h-7 flex items-center justify-center rounded text-text-muted hover:text-text-secondary hover:bg-white/[0.04] transition-colors"
            title="Recolher"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Filters */}
      <FilterBar
        projects={projects}
        terminals={terminals}
        filters={effectiveFilters}
        onFilterChange={handleFilterChange}
        searchInput={searchInput}
        onSearch={handleSearch}
      />

      {/* Table content — brandbook tbl style */}
      <div className="flex-1 overflow-auto">
        {sessionsLoading && (
          <div className="px-5 py-4 space-y-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-[40px] rounded bg-white/[0.02] shimmer" />
            ))}
          </div>
        )}

        {!sessionsLoading && sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center mb-3 border border-border">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-text-muted">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points="13 2 13 9 20 9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="font-mono text-[0.65rem] text-text-muted">Nenhuma sessão ativa</p>
            <p className="font-mono text-[0.55rem] text-text-muted mt-1">Inicie o Claude Code para ver atividade</p>
          </div>
        )}

        {!sessionsLoading && sessions.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-mono text-[0.65rem]">
              <ColHeader />
              <tbody>
                {activeSessions.length > 0 && (
                  <tr className="bg-surface-1">
                    <td colSpan={8} className="py-2 px-5">
                      <span className="flex items-center gap-2">
                        <span className="w-[5px] h-[5px] rounded-full bg-accent-orange animate-pulse" />
                        <span className="font-mono text-[0.5rem] font-medium text-accent-orange/70 uppercase tracking-[0.08em]">
                          Em curso ({activeSessions.length})
                        </span>
                      </span>
                    </td>
                  </tr>
                )}
                {activeSessions.map((s) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    onClick={() => setSelectedSession(s)}
                    agentData={agentByName.get(s.terminal_agent_name ?? s.agent_name ?? '')}
                    projectName={projectMap.get(s.project_id)?.name}
                  />
                ))}

                {pastSessions.length > 0 && (
                  <tr>
                    <td colSpan={8} className="py-2 px-5">
                      <span className="font-mono text-[0.5rem] font-medium text-text-muted uppercase tracking-[0.08em]">
                        Recentes ({pastSessions.length})
                      </span>
                    </td>
                  </tr>
                )}
                {pastSessions.map((s) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    onClick={() => setSelectedSession(s)}
                    agentData={agentByName.get(s.terminal_agent_name ?? s.agent_name ?? '')}
                    projectName={projectMap.get(s.project_id)?.name}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {hasMore && !sessionsLoading && (
          <div className="flex justify-center py-4">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="btn btn-ghost btn-sm font-mono uppercase tracking-[0.08em]"
            >
              {loadingMore ? 'A carregar...' : 'Carregar mais'}
            </button>
          </div>
        )}
      </div>

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
