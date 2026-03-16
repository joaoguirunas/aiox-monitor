'use client';

import { useProjects } from '@/hooks/useProjects';
import { useProjectContext } from '@/contexts/ProjectContext';

export function ProjectSelector() {
  const { projects } = useProjects();
  const { selectedProjectId, setSelectedProjectId } = useProjectContext();

  return (
    <div className="relative">
      <select
        aria-label="Selecionar projeto"
        value={selectedProjectId ?? ''}
        onChange={(e) => {
          const val = e.target.value;
          setSelectedProjectId(val === '' ? null : parseInt(val, 10));
        }}
        className="appearance-none bg-surface-2/60 text-text-secondary text-2xs font-medium rounded-lg pl-3 pr-7 py-1.5 border border-border hover:border-border-hover focus:outline-none focus:border-accent-blue/30 focus:ring-1 focus:ring-accent-blue/10 transition-all cursor-pointer"
      >
        <option value="">Todos os projetos</option>
        {projects.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {/* Custom chevron */}
      <svg
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );
}
