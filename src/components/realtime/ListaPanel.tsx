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

// ─── Session Row ─────────────────────────────────────────────────────────────

const GRID_COLS = '44px 92px 90px 78px 96px 100px 1fr 54px';

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
  const agentColor = hasAgent ? getAgentColor(agentName) : '#3a3f52';
  const spritePath = hasAgent ? PIXELLAB_SPRITES[agentName!]?.directions?.south : undefined;
  const agentLabel = agentDisplay ?? agentName ?? '—';
  const agentInitial = agentLabel.charAt(0).toUpperCase();
  const roleText = agentData?.role ?? '—';
  const teamText = agentData?.team ?? '—';

  // Comando: tool detail when active, otherwise first line of prompt
  let command = '';
  if (isActive && session.terminal_current_tool_detail) {
    command = session.terminal_current_tool_detail;
  } else if (session.prompt) {
    const firstLine = session.prompt.split('\n')[0];
    command = firstLine.length > 55 ? firstLine.slice(0, 55) + '…' : firstLine;
  }

  const isPermWait = session.terminal_waiting_permission === 1;

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left grid items-center gap-x-1 px-4
        transition-colors duration-100 group
        ${isActive
          ? 'h-[60px] bg-accent-blue/[0.04] hover:bg-accent-blue/[0.07] border-l-2 border-l-accent-blue/30'
          : 'h-[48px] hover:bg-white/[0.025]'}
      `}
      style={{ gridTemplateColumns: GRID_COLS }}
    >
      {/* Avatar — circular */}
      <div className="flex items-center justify-center pr-1">
        {spritePath ? (
          <div
            className="w-[32px] h-[32px] shrink-0 border"
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
            className="w-[32px] h-[32px] shrink-0 flex items-center justify-center text-[11px] font-bold text-white/90"
            style={{
              backgroundColor: hasAgent ? agentColor : '#1e2030',
              borderRadius: '50%',
            }}
          >
            {hasAgent ? agentInitial : '⚡'}
          </div>
        )}
      </div>

      {/* Agente */}
      <div className="truncate pr-3">
        <span
          className="text-[12px] font-semibold leading-none"
          style={{ color: hasAgent ? agentColor : '#6a7098' }}
        >
          {agentLabel}
        </span>
      </div>

      {/* Role */}
      <div className="truncate pr-3">
        <span className="text-[11px] text-[#8892b0] leading-none">{roleText}</span>
      </div>

      {/* Squad */}
      <div className="truncate pr-3">
        <span className="text-[11px] text-[#6b7394] leading-none">{teamText}</span>
      </div>

      {/* Janela */}
      <div className="truncate pr-3 flex items-center gap-1.5 min-w-0">
        <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${
          isProcessing ? 'bg-emerald-400 animate-pulse' : session.terminal_status === 'active' ? 'bg-amber-400' : 'bg-zinc-700/50'
        }`} />
        <span className="text-[11px] text-[#8892b0] truncate leading-none">
          {session.terminal_title ?? '—'}
        </span>
      </div>

      {/* Projeto */}
      <div className="truncate pr-3">
        <span className="text-[11px] text-[#6b7394] leading-none">{projectName ?? '—'}</span>
      </div>

      {/* Comando */}
      <div className="min-w-0 truncate pr-3">
        <span className={`text-[11px] font-mono leading-none ${
          isActive && session.terminal_current_tool_detail
            ? 'text-accent-blue/80'
            : 'text-[#505878]'
        }`}>
          {isPermWait && (
            <span className="inline-block w-[5px] h-[5px] rounded-full bg-amber-400 animate-pulse mr-1.5 align-middle" />
          )}
          {command || '—'}
        </span>
      </div>

      {/* Tempo */}
      <div className="text-right">
        <span className={`text-[10px] font-mono tabular-nums ${
          isActive ? 'text-accent-blue/70' : 'text-[#6b7394]'
        }`}>
          {isActive ? liveTimer(session.started_at) : timeAgo(session.started_at)}
        </span>
      </div>
    </button>
  );
}

// ─── Column Header ──────────────────────────────────────────────────────────

function ColHeader() {
  return (
    <div
      className="grid items-center gap-x-1 px-4 h-[30px] bg-[#0c0d14] shrink-0 select-none"
      style={{ gridTemplateColumns: GRID_COLS }}
    >
      <div />
      <div><span className="text-[9px] font-medium text-[#505878] uppercase tracking-[0.14em]">Agente</span></div>
      <div><span className="text-[9px] font-medium text-[#505878] uppercase tracking-[0.14em]">Role</span></div>
      <div><span className="text-[9px] font-medium text-[#505878] uppercase tracking-[0.14em]">Squad</span></div>
      <div><span className="text-[9px] font-medium text-[#505878] uppercase tracking-[0.14em]">Janela</span></div>
      <div><span className="text-[9px] font-medium text-[#505878] uppercase tracking-[0.14em]">Projeto</span></div>
      <div><span className="text-[9px] font-medium text-[#505878] uppercase tracking-[0.14em]">Comando</span></div>
      <div />
    </div>
  );
}

// ─── Filter Bar ─────────────────────────────────────────────────────────────

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
    <div className="px-4 py-2.5 shrink-0 flex flex-wrap items-center gap-2">
      {/* Search inline */}
      <div className="relative">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Pesquisar..."
          className="w-[140px] bg-white/[0.03] border border-white/[0.06] text-[#8892b0] text-[10px] rounded-md pl-7 pr-2 py-1 hover:border-white/[0.1] focus:outline-none focus:border-accent-blue/30 focus:w-[200px] transition-all placeholder:text-[#3d4462]"
        />
        <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#3d4462]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {/* Separator */}
      {projects.length > 0 && <div className="w-px h-4 bg-white/[0.06]" />}

      {/* Project badges */}
      {projects.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => onFilterChange({ projectId: undefined })}
            className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${
              !filters.projectId
                ? 'bg-accent-blue/15 text-accent-blue border border-accent-blue/25'
                : 'bg-white/[0.03] text-[#6b7394] border border-white/[0.06] hover:border-white/[0.12] hover:text-[#8892b0]'
            }`}
          >
            Todos
          </button>
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => onFilterChange({ projectId: filters.projectId === p.id ? undefined : p.id })}
              className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${
                filters.projectId === p.id
                  ? 'bg-accent-blue/15 text-accent-blue border border-accent-blue/25'
                  : 'bg-white/[0.03] text-[#6b7394] border border-white/[0.06] hover:border-white/[0.12] hover:text-[#8892b0]'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* Terminal filter */}
      {activeTerminals.length > 1 && (
        <>
          <div className="w-px h-4 bg-white/[0.06]" />
          <select
            value={filters.terminalId ?? ''}
            onChange={(e) => onFilterChange({ terminalId: e.target.value ? Number(e.target.value) : undefined })}
            className="px-2 py-1 text-[10px] font-medium rounded-md bg-white/[0.03] text-[#8892b0] border border-white/[0.06] hover:border-white/[0.12] focus:outline-none focus:border-accent-blue/30 transition-all cursor-pointer appearance-none pr-6"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%236b7394' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
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

  // Live tick for active session timers
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
    <div className="h-full flex flex-col bg-[#0a0b10] border-l border-white/[0.06] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-[48px] shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-[7px] h-[7px] rounded-full bg-accent-blue animate-pulse" />
            <h2 className="text-[13px] font-semibold text-[#c8cfe0] tracking-tight font-display">Activity Feed</h2>
          </div>
          {!sessionsLoading && (
            <span className="text-[10px] text-[#505878] font-mono tabular-nums bg-white/[0.03] px-1.5 py-0.5 rounded">
              {sessions.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={refresh}
            disabled={sessionsLoading}
            className="p-1.5 rounded text-[#505878] hover:text-[#8892b0] hover:bg-white/[0.04] transition-colors disabled:opacity-20"
            title="Atualizar"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 11-6.219-8.56" /><polyline points="21 3 21 9 15 9" />
            </svg>
          </button>
          <button
            onClick={onToggle}
            className="p-1.5 rounded text-[#505878] hover:text-[#8892b0] hover:bg-white/[0.04] transition-colors"
            title="Recolher"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Search + Filters (inline) */}
      <FilterBar
        projects={projects}
        terminals={terminals}
        filters={effectiveFilters}
        onFilterChange={handleFilterChange}
        searchInput={searchInput}
        onSearch={handleSearch}
      />

      {/* Column headers */}
      {!sessionsLoading && sessions.length > 0 && <ColHeader />}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {sessionsLoading && (
          <div className="px-4 py-4 space-y-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-[46px] rounded bg-white/[0.02] shimmer" />
            ))}
          </div>
        )}

        {!sessionsLoading && sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-10 h-10 rounded-full bg-white/[0.03] flex items-center justify-center mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-[#3d4462]">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points="13 2 13 9 20 9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-[12px] text-[#505878]">Nenhuma sessao activa</p>
            <p className="text-[11px] text-[#3d4462] mt-1">Inicie o Claude Code para ver atividade</p>
          </div>
        )}

        {activeSessions.length > 0 && (
          <div>
            <div className="flex items-center gap-2 px-4 h-[28px] bg-accent-blue/[0.03]">
              <span className="w-[5px] h-[5px] rounded-full bg-accent-blue animate-pulse" />
              <span className="text-[9px] font-semibold text-accent-blue/50 uppercase tracking-[0.14em]">
                Em curso ({activeSessions.length})
              </span>
            </div>
            {activeSessions.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                onClick={() => setSelectedSession(s)}
                agentData={agentByName.get(s.terminal_agent_name ?? s.agent_name ?? '')}
                projectName={projectMap.get(s.project_id)?.name}
              />
            ))}
          </div>
        )}

        {pastSessions.length > 0 && (
          <div>
            <div className="flex items-center gap-2 px-4 h-[28px] mt-1">
              <span className="text-[9px] font-semibold text-[#505878] uppercase tracking-[0.14em]">
                Recentes ({pastSessions.length})
              </span>
            </div>
            {pastSessions.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                onClick={() => setSelectedSession(s)}
                agentData={agentByName.get(s.terminal_agent_name ?? s.agent_name ?? '')}
                projectName={projectMap.get(s.project_id)?.name}
              />
            ))}
          </div>
        )}

        {hasMore && !sessionsLoading && (
          <div className="flex justify-center py-4">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="px-4 py-1.5 text-[10px] text-[#505878] hover:text-[#8892b0] border border-white/[0.06] hover:border-white/[0.1] rounded-md transition-all disabled:opacity-30 font-medium"
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
