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

// Generic titles that don't represent real project sessions
const GENERIC_TITLES = new Set(['claude code', 'terminal', 'terminal system overhaul', 'basic', 'zsh', 'bash']);

function cleanTitle(raw: string): string {
  return raw
    .replace(/^[\u2800-\u28FF✳●◉◈⬤☐☑✓✔✕✖✗✘⚡⏳🔄\s]+/u, '')
    .trim() || raw.trim();
}

function isGenericTitle(title: string): boolean {
  return GENERIC_TITLES.has(cleanTitle(title).toLowerCase());
}

/** Keep only 1 terminal per unique clean title, preferring processing > active > inactive */
function bestPerTitle(terminals: Terminal[]): Terminal[] {
  const map = new Map<string, Terminal>();
  const statusRank: Record<string, number> = { processing: 0, active: 1, inactive: 2 };

  for (const t of terminals) {
    const key = t.window_title ? cleanTitle(t.window_title).toLowerCase() : `pid-${t.pid}`;
    const existing = map.get(key);
    if (!existing) { map.set(key, t); continue; }

    const tRank = statusRank[t.status] ?? 3;
    const eRank = statusRank[existing.status] ?? 3;
    if (tRank < eRank || (tRank === eRank && (t.agent_name && !existing.agent_name))) {
      map.set(key, t);
    }
  }
  return Array.from(map.values());
}

export function FilterBar({ filters, onFiltersChange, projects, agents, terminals, viewMode, onViewModeChange }: FilterBarProps) {
  const hasFilters =
    filters.projectId !== undefined ||
    filters.agentId !== undefined ||
    filters.terminalId !== undefined ||
    viewMode !== 'summary';

  const selectClass =
    'appearance-none bg-surface-1/50 border border-border/50 text-text-secondary text-[11px] font-medium rounded-md pl-3 pr-7 py-1.5 hover:border-border focus:outline-none focus:border-accent-blue/30 transition-colors cursor-pointer';

  // Only keep terminals with real project titles (not "Claude Code", "Terminal", etc.)
  // Exception: processing terminals always show regardless of title
  const projectTerminals = bestPerTitle(
    terminals.filter(t => {
      if (t.status === 'processing') return true;
      if (!t.window_title) return false;
      return !isGenericTitle(t.window_title);
    })
  ).sort((a, b) => {
    // processing first, then alphabetical by title
    const order: Record<string, number> = { processing: 0, active: 1, inactive: 2 };
    const byStatus = (order[a.status] ?? 3) - (order[b.status] ?? 3);
    if (byStatus !== 0) return byStatus;
    const aTitle = a.window_title ? cleanTitle(a.window_title) : '';
    const bTitle = b.window_title ? cleanTitle(b.window_title) : '';
    return aTitle.localeCompare(bTitle);
  });

  return (
    <div className="flex flex-col gap-2">
      {/* Line 1: Dropdowns */}
      <div className="flex items-center gap-2 flex-wrap">
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
            className="text-[10px] text-text-muted hover:text-accent-blue transition-colors font-medium"
            onClick={() => { onFiltersChange({}); onViewModeChange('summary'); }}
          >
            Limpar
          </button>
        )}
      </div>

      {/* Line 2-3: Terminal session pills — max 10 per line */}
      {projectTerminals.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 max-w-full">
          {projectTerminals.map((t) => {
            const isSelected = filters.terminalId === t.id;
            const title = t.window_title ? cleanTitle(t.window_title) : `PID ${t.pid}`;
            const short = title.length > 18 ? title.slice(0, 18) + '…' : title;
            const agent = t.agent_display_name || (t.agent_name && t.agent_name !== '@unknown' ? t.agent_name.replace('@', '') : null);

            const dot = t.status === 'processing'
              ? 'bg-emerald-400 animate-pulse'
              : t.status === 'active'
                ? 'bg-amber-400'
                : 'bg-zinc-500/40';

            return (
              <button
                key={t.id}
                onClick={() => onFiltersChange({ ...filters, terminalId: isSelected ? undefined : t.id })}
                title={`${title}${agent ? ` · ${agent}` : ''} · PID ${t.pid} · ${t.status}`}
                className={`
                  inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium
                  border transition-colors cursor-pointer select-none
                  ${isSelected
                    ? 'bg-blue-500/15 text-blue-400 border-blue-500/40'
                    : t.status === 'inactive'
                      ? 'bg-zinc-800/30 text-zinc-500 border-zinc-700/30 hover:border-zinc-600/50'
                      : 'bg-zinc-800/50 text-zinc-300 border-zinc-700/50 hover:border-zinc-500/60 hover:text-zinc-200'
                  }
                `}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                <span>{short}</span>
                {agent && <span className="text-[8px] opacity-50">({agent})</span>}
              </button>
            );
          })}
        </div>
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
