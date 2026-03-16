'use client';

import type { EventFilters, EventType, Project, AgentWithStats, Terminal } from '@/lib/types';

type ViewMode = 'summary' | 'all' | EventType;

const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: 'summary', label: 'Resumido' },
  { value: 'all', label: 'Tudo' },
  { value: 'UserPromptSubmit', label: 'Prompts' },
  { value: 'Stop', label: 'Respostas' },
  { value: 'PreToolUse', label: 'Ações' },
  { value: 'PostToolUse', label: 'Resultados' },
];

interface FilterBarProps {
  filters: EventFilters;
  onFiltersChange: (f: EventFilters) => void;
  projects: Project[];
  agents: AgentWithStats[];
  terminals: Terminal[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export type { ViewMode };

function truncateTitle(title: string, max = 25): string {
  // Show last meaningful part of path-like titles (e.g. "~/Desktop/my-project" → "my-project")
  const parts = title.replace(/^~\//, '').split('/');
  const last = parts[parts.length - 1] || title;
  return last.length > max ? last.slice(0, max) + '…' : last;
}

export function FilterBar({ filters, onFiltersChange, projects, agents, terminals, viewMode, onViewModeChange }: FilterBarProps) {
  const hasFilters =
    filters.projectId !== undefined ||
    filters.agentId !== undefined ||
    filters.terminalId !== undefined ||
    viewMode !== 'summary';

  const activeTerminals = terminals.filter(t => t.status !== 'inactive');

  const selectClass =
    'appearance-none bg-surface-1/50 border border-border/50 text-text-secondary text-[11px] font-medium rounded-md pl-3 pr-7 py-1.5 hover:border-border focus:outline-none focus:border-accent-blue/30 transition-colors cursor-pointer';

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {/* Terminal pills — only active terminals */}
      {activeTerminals.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-text-muted font-medium mr-0.5">Terminal:</span>
          {activeTerminals.map((t) => {
            const isSelected = filters.terminalId === t.id;
            const isProcessing = t.status === 'processing';
            return (
              <button
                key={t.id}
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    terminalId: isSelected ? undefined : t.id,
                  })
                }
                className={`
                  inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono font-medium
                  border transition-all duration-150 cursor-pointer
                  ${isSelected
                    ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                    : 'bg-surface-1/50 text-text-secondary border-border/50 hover:border-border hover:text-text-primary'
                  }
                `}
                title={`PID ${t.pid}${t.window_title ? ` — ${t.window_title}` : ''}${t.agent_name ? ` · ${t.agent_display_name ?? t.agent_name}` : ''}${t.current_tool ? ` · ${t.current_tool}` : ''}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isProcessing ? 'bg-accent-emerald animate-pulse' : 'bg-accent-amber'}`} />
                <span>{t.window_title ? truncateTitle(t.window_title) : `PID ${t.pid}`}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="relative">
        <select
          className={selectClass}
          value={filters.projectId ?? ''}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              projectId: e.target.value ? Number(e.target.value) : undefined,
              agentId: undefined,
              terminalId: undefined,
            })
          }
        >
          <option value="">Todos os projetos</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <ChevronIcon />
      </div>

      <div className="relative">
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
            <option key={a.id} value={a.id}>{a.display_name ?? a.name}</option>
          ))}
        </select>
        <ChevronIcon />
      </div>

      <div className="relative">
        <select
          className={selectClass}
          value={viewMode}
          onChange={(e) => onViewModeChange(e.target.value as ViewMode)}
        >
          {VIEW_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronIcon />
      </div>

      {hasFilters && (
        <button
          className="text-2xs text-text-muted hover:text-accent-blue transition-colors font-medium"
          onClick={() => {
            onFiltersChange({});
            onViewModeChange('summary');
          }}
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg
      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
