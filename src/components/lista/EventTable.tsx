import type { Event, AgentWithStats, Project, Terminal } from '@/lib/types';
import { EventRow } from './EventRow';

interface EventTableProps {
  events: Event[];
  loading: boolean;
  agents: AgentWithStats[];
  projects: Project[];
  terminals: Terminal[];
  onRowClick: (event: Event) => void;
}

const COLUMNS = ['Timestamp', 'Projeto', 'Agente', 'Terminal', 'Tipo', 'Tool', 'Descrição'];

export function EventTable({ events, loading, agents, projects, terminals, onRowClick }: EventTableProps) {
  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const terminalMap = new Map(terminals.map((t) => [t.id, t]));

  return (
    <div className="overflow-x-auto rounded-lg border border-border/40 bg-surface-1/30 w-full">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-border/30 bg-surface-1/40">
            {COLUMNS.map((col) => (
              <th
                key={col}
                className="px-4 py-2.5 text-[11px] font-medium text-text-muted tracking-wide whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <>
              {Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border/20">
                  {COLUMNS.map((col) => (
                    <td key={col} className="px-4 py-2.5">
                      <div className="h-3 shimmer rounded w-full max-w-[100px]" />
                    </td>
                  ))}
                </tr>
              ))}
            </>
          )}

          {!loading && events.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} className="px-4 py-12 text-center">
                <p className="text-sm text-text-secondary font-medium">Nenhum evento registado</p>
                <p className="text-[11px] text-text-muted mt-1.5">Inicie o Claude Code para monitorizar</p>
              </td>
            </tr>
          )}

          {!loading &&
            events.map((event) => {
              const agent = event.agent_id ? agentMap.get(event.agent_id) : undefined;
              const project = projectMap.get(event.project_id);
              const terminal = event.terminal_id ? terminalMap.get(event.terminal_id) : undefined;
              return (
                <EventRow
                  key={event.id}
                  event={event}
                  agentName={agent?.name}
                  agentDisplayName={agent?.display_name}
                  projectName={project?.name}
                  terminal={terminal}
                  onClick={() => onRowClick(event)}
                />
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
