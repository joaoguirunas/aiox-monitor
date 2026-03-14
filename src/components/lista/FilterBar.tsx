'use client';

import type { EventFilters, EventType, Project, AgentWithStats } from '@/lib/types';

const EVENT_TYPES: EventType[] = [
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'Stop',
  'SubagentStop',
];

interface FilterBarProps {
  filters: EventFilters;
  onFiltersChange: (f: EventFilters) => void;
  projects: Project[];
  agents: AgentWithStats[];
}

export function FilterBar({ filters, onFiltersChange, projects, agents }: FilterBarProps) {
  const selectClass =
    'bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded px-2 py-1.5 focus:outline-none focus:border-gray-500';

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        className={selectClass}
        value={filters.projectId ?? ''}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            projectId: e.target.value ? Number(e.target.value) : undefined,
            agentId: undefined,
          })
        }
      >
        <option value="">Todos os projetos</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <select
        className={selectClass}
        value={filters.agentId ?? ''}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            agentId: e.target.value ? Number(e.target.value) : undefined,
          })
        }
      >
        <option value="">Todos os agentes</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.display_name ?? a.name}
          </option>
        ))}
      </select>

      <select
        className={selectClass}
        value={filters.type ?? ''}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            type: (e.target.value as EventType) || undefined,
          })
        }
      >
        <option value="">Todos os tipos</option>
        {EVENT_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      {(filters.projectId !== undefined ||
        filters.agentId !== undefined ||
        filters.type !== undefined) && (
        <button
          className="text-xs text-gray-400 hover:text-gray-200 underline"
          onClick={() => onFiltersChange({})}
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}
