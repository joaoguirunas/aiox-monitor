'use client';

import { useState, useMemo } from 'react';
import type { Event, EventFilters } from '@/lib/types';
import { useEvents } from '@/hooks/useEvents';
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
import { groupBySession } from '@/components/lista/SessionRow';
import type { SessionGroup } from '@/components/lista/SessionRow';

export default function ListaPage() {
  const [filters, setFilters] = useState<EventFilters>({ limit: 200 });
  const [viewMode, setViewMode] = useState<ViewMode>('summary');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionGroup | null>(null);
  const { selectedProjectId, setSelectedProjectId } = useProjectContext();

  const effectiveFilters: EventFilters = {
    ...filters,
    projectId: selectedProjectId ?? filters.projectId,
  };

  const { events, loading, total, refresh } = useEvents(effectiveFilters);

  const isSessionView = viewMode === 'summary';

  // Session groups for summary view
  const sessions = useMemo(() => {
    if (!isSessionView) return [];
    return groupBySession(events);
  }, [events, isSessionView]);

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

  const displayCount = isSessionView ? sessions.length : filteredEvents.length;

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
              {displayCount} {isSessionView ? 'sessão' : 'evento'}{displayCount !== 1 ? (isSessionView ? 'ões' : 's') : ''}
              {' '}de {total} evento{total !== 1 ? 's' : ''}
              {isSessionView && ' (agrupado)'}
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
          agents={agents}
          projects={projects}
          terminals={terminals}
          onRowClick={setSelectedSession}
        />
      ) : (
        <EventTable
          events={filteredEvents}
          loading={loading}
          agents={agents}
          projects={projects}
          terminals={terminals}
          onRowClick={setSelectedEvent}
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
