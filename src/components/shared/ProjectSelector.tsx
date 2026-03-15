'use client';

import { useProjects } from '@/hooks/useProjects';
import { useProjectContext } from '@/contexts/ProjectContext';

export function ProjectSelector() {
  const { projects } = useProjects();
  const { selectedProjectId, setSelectedProjectId } = useProjectContext();

  return (
    <select
      aria-label="Selecionar projeto"
      value={selectedProjectId ?? ''}
      onChange={(e) => {
        const val = e.target.value;
        setSelectedProjectId(val === '' ? null : parseInt(val, 10));
      }}
      className="bg-gray-800 text-gray-200 text-sm rounded px-2 py-1 border border-gray-700 focus:outline-none focus:border-gray-500"
    >
      <option value="">Todos os projetos</option>
      {projects.map(p => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
