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
        className="appearance-none bg-white/[0.04] text-text-muted text-[11px] font-medium rounded-md pl-2.5 pr-6 py-1 border border-border/40 hover:border-border/60 focus:outline-none focus:border-accent-blue/30 transition-colors cursor-pointer"
      >
        <option value="">Todos os projetos</option>
        {projects.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-text-muted/60"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );
}
