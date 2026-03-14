import type { Event, AgentWithStats, Project } from '@/lib/types';
import { EventRow } from './EventRow';

interface EventTableProps {
  events: Event[];
  loading: boolean;
  agents: AgentWithStats[];
  projects: Project[];
  onRowClick: (event: Event) => void;
}

const COLUMNS = ['Timestamp', 'Projeto', 'Agente', 'Tipo', 'Tool', 'Resumo'];

export function EventTable({ events, loading, agents, projects, onRowClick }: EventTableProps) {
  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-800">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-gray-800/80">
            {COLUMNS.map((col) => (
              <th
                key={col}
                className="px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-800">
                  {COLUMNS.map((col) => (
                    <td key={col} className="px-4 py-2.5">
                      <div className="h-4 bg-gray-800 rounded animate-pulse w-full max-w-[120px]" />
                    </td>
                  ))}
                </tr>
              ))}
            </>
          )}

          {!loading && events.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} className="px-4 py-12 text-center text-gray-500">
                Nenhum evento ainda. Inicie o Claude Code em algum projeto.
              </td>
            </tr>
          )}

          {!loading &&
            events.map((event) => {
              const agent = event.agent_id ? agentMap.get(event.agent_id) : undefined;
              const project = projectMap.get(event.project_id);
              return (
                <EventRow
                  key={event.id}
                  event={event}
                  agentName={agent?.name}
                  agentDisplayName={agent?.display_name}
                  projectName={project?.name}
                  onClick={() => onRowClick(event)}
                />
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
