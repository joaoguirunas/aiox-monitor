'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Event, EventFilters, SessionWithSummary } from '@/lib/types';
import { useEvents } from '@/hooks/useEvents';
import { useSessions } from '@/hooks/useSessions';
import { useProjects } from '@/hooks/useProjects';
import { useAgents } from '@/hooks/useAgents';
import { useTerminals } from '@/hooks/useTerminals';
import { useProjectContext } from '@/contexts/ProjectContext';
import { FilterBar } from '@/components/lista/FilterBar';
import type { ViewMode } from '@/components/lista/FilterBar';
import { EventTable } from '@/components/lista/EventTable';
import { EventDetail } from '@/components/lista/EventDetail';
import { SessionTable } from '@/components/lista/SessionTable';
import { SessionDetail } from '@/components/lista/SessionDetail';

export default function ListaPage() {
  const [filters, setFilters] = useState<EventFilters>({ limit: 50 });
  const [viewMode, setViewMode] = useState<ViewMode>('summary');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionWithSummary | null>(null);
  const { selectedProjectId, setSelectedProjectId } = useProjectContext();

  const isSessionView = viewMode === 'summary';

  const effectiveFilters: EventFilters = {
    ...filters,
    projectId: selectedProjectId ?? filters.projectId,
  };

  // Events hook — only used for non-session views (empty filters = disabled, QA C1 fix)
  const {
    events,
    loading: eventsLoading,
    loadingMore: eventsLoadingMore,
    total: eventsTotal,
    hasMore: eventsHasMore,
    loadMore: eventsLoadMore,
    refresh: eventsRefresh,
  } = useEvents(isSessionView ? {} : effectiveFilters);

  // Sessions hook — only used for session (summary) view
  const {
    sessions,
    loading: sessionsLoading,
    loadingMore,
    total: sessionsTotal,
    hasMore,
    loadMore,
    refresh: sessionsRefresh,
  } = useSessions(
    isSessionView
      ? {
          projectId: effectiveFilters.projectId,
          agentId: effectiveFilters.agentId,
          terminalId: effectiveFilters.terminalId,
          search: effectiveFilters.search,
          since: effectiveFilters.since,
          until: effectiveFilters.until,
        }
      : {},
  );

  const loading = isSessionView ? sessionsLoading : eventsLoading;
  const refresh = isSessionView ? sessionsRefresh : eventsRefresh;

  // Filtered events for non-session views
  const filteredEvents = useMemo(() => {
    if (isSessionView) return [];
    if (viewMode === 'all') return events;
    return events.filter((e) => e.type === viewMode);
  }, [events, viewMode, isSessionView]);

  const handleFiltersChange = (newFilters: EventFilters) => {
    setFilters(newFilters);
    if (newFilters.projectId !== filters.projectId) {
      setSelectedProjectId(newFilters.projectId ?? null);
    }
  };
  const { projects } = useProjects();
  const { agents } = useAgents(effectiveFilters.projectId);
  const { terminals } = useTerminals(effectiveFilters.projectId);

  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const selectedAgent = selectedEvent?.agent_id ? agentMap.get(selectedEvent.agent_id) : undefined;
  const selectedProject = selectedEvent ? projectMap.get(selectedEvent.project_id) : undefined;

  // Retention badge — fetch company config once
  const [retentionDays, setRetentionDays] = useState<number | null>(null);
  useEffect(() => {
    fetch('/api/company-config')
      .then((r) => r.json())
      .then((data) => {
        if (data.event_retention_days) setRetentionDays(data.event_retention_days);
      })
      .catch(() => { /* graceful — AC7 */ });
  }, []);

  // Counters — correct units per view
  const displayCount = isSessionView ? sessions.length : filteredEvents.length;
  const displayTotal = isSessionView ? sessionsTotal : eventsTotal;
  const unitPlural = isSessionView ? 'sessões' : 'eventos';
  const activeHasMore = isSessionView ? hasMore : eventsHasMore;
  const activeLoadMore = isSessionView ? loadMore : eventsLoadMore;

  const handleExportJSON = () => {
    const data = isSessionView ? sessions : filteredEvents;
    const activeFilters: Record<string, unknown> = {};
    if (effectiveFilters.projectId) activeFilters.projectId = effectiveFilters.projectId;
    if (effectiveFilters.agentId) activeFilters.agentId = effectiveFilters.agentId;
    if (effectiveFilters.terminalId) activeFilters.terminalId = effectiveFilters.terminalId;
    if (effectiveFilters.search) activeFilters.search = effectiveFilters.search;
    if (effectiveFilters.since) activeFilters.since = effectiveFilters.since;
    if (effectiveFilters.until) activeFilters.until = effectiveFilters.until;
    if (!isSessionView && viewMode !== 'all') activeFilters.type = viewMode;

    const exportObj = {
      exported_at: new Date().toISOString(),
      filters: activeFilters,
      view: isSessionView ? 'sessions' : 'events',
      total: data.length,
      data,
    };

    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aiox-${isSessionView ? 'sessions' : 'events'}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="w-full px-4 py-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-semibold text-text-primary font-display tracking-tight">
            {isSessionView ? 'Sessões' : 'Eventos'}
          </h1>
          {!loading && (
            <span className="text-[11px] text-text-muted">
              {displayCount === displayTotal
                ? `${displayCount} ${unitPlural}`
                : `${displayCount} ${unitPlural} de ${displayTotal} total`}
              {activeHasMore && (
                <>
                  {' — '}
                  <button
                    onClick={activeLoadMore}
                    className="text-accent-blue/70 hover:text-accent-blue underline underline-offset-2 transition-colors"
                  >
                    carregar mais
                  </button>
                </>
              )}
            </span>
          )}
          {retentionDays !== null && (
            <span className="text-[10px] text-text-muted/50 bg-surface-3/40 px-1.5 py-0.5 rounded">
              Retenção: {retentionDays} dias
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <FilterBar
            filters={effectiveFilters}
            onFiltersChange={handleFiltersChange}
            projects={projects}
            agents={agents}
            terminals={terminals}
            viewMode={viewMode}
            onViewModeChange={(mode) => {
              setViewMode(mode);
              setSelectedEvent(null);
              setSelectedSession(null);
            }}
          />
          <button
            onClick={handleExportJSON}
            disabled={loading || displayCount === 0}
            className="px-2.5 py-1 text-[11px] font-medium text-text-muted hover:text-text-secondary rounded-md border border-border/50 hover:border-border transition-colors disabled:opacity-30"
            title="Exportar dados visíveis como JSON"
          >
            Exportar JSON
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            className="px-2.5 py-1 text-[11px] font-medium text-text-muted hover:text-text-secondary rounded-md border border-border/50 hover:border-border transition-colors disabled:opacity-30"
          >
            {loading ? 'A carregar...' : 'Atualizar'}
          </button>
        </div>
      </div>

      {/* Table */}
      {isSessionView ? (
        <SessionTable
          sessions={sessions}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          agents={agents}
          projects={projects}
          terminals={terminals}
          onRowClick={setSelectedSession}
          onLoadMore={loadMore}
        />
      ) : (
        <EventTable
          events={filteredEvents}
          loading={loading}
          loadingMore={eventsLoadingMore}
          hasMore={eventsHasMore}
          agents={agents}
          projects={projects}
          terminals={terminals}
          onRowClick={setSelectedEvent}
          onLoadMore={eventsLoadMore}
        />
      )}

      {isSessionView ? (
        <SessionDetail
          session={selectedSession}
          agents={agents}
          projects={projects}
          terminals={terminals}
          onClose={() => setSelectedSession(null)}
        />
      ) : (
        <EventDetail
          event={selectedEvent}
          agentName={selectedAgent?.name}
          agentDisplayName={selectedAgent?.display_name}
          projectName={selectedProject?.name}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </main>
  );
}
