'use client';

import { useState } from 'react';
import type { Event, EventFilters } from '@/lib/types';
import { useEvents } from '@/hooks/useEvents';
import { useProjects } from '@/hooks/useProjects';
import { useAgents } from '@/hooks/useAgents';
import { FilterBar } from '@/components/lista/FilterBar';
import { EventTable } from '@/components/lista/EventTable';
import { EventDetail } from '@/components/lista/EventDetail';

export default function ListaPage() {
  const [filters, setFilters] = useState<EventFilters>({ limit: 100 });
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  const { events, loading, total } = useEvents(filters);
  const { projects } = useProjects();
  const { agents } = useAgents(filters.projectId);

  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const selectedAgent = selectedEvent?.agent_id ? agentMap.get(selectedEvent.agent_id) : undefined;
  const selectedProject = selectedEvent ? projectMap.get(selectedEvent.project_id) : undefined;

  return (
    <main className="min-h-screen bg-gray-950">
      <div className="max-w-screen-xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-lg font-semibold text-gray-100">Eventos</h1>
            {!loading && (
              <p className="text-xs text-gray-500 mt-0.5">
                {total} evento{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>

        <div className="mb-4">
          <FilterBar
            filters={filters}
            onFiltersChange={setFilters}
            projects={projects}
            agents={agents}
          />
        </div>

        <EventTable
          events={events}
          loading={loading}
          agents={agents}
          projects={projects}
          onRowClick={setSelectedEvent}
        />
      </div>

      <EventDetail
        event={selectedEvent}
        agentName={selectedAgent?.name}
        agentDisplayName={selectedAgent?.display_name}
        projectName={selectedProject?.name}
        onClose={() => setSelectedEvent(null)}
      />
    </main>
  );
}
