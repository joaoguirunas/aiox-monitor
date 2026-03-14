'use client';

import { useKanban } from '@/hooks/useKanban';
import { useProjectContext } from '@/contexts/ProjectContext';
import { ProjectColumn } from '@/components/kanban/ProjectColumn';
import type { WsEventNew } from '@/lib/types';

export default function KanbanPage() {
  const { columns, loading, lastMessage } = useKanban();
  const { selectedProjectId } = useProjectContext();

  const lastEventMessage =
    lastMessage?.type === 'event:new' ? (lastMessage as WsEventNew) : null;

  const visibleColumns = selectedProjectId
    ? columns.filter(col => col.project.id === selectedProjectId)
    : columns;

  if (loading) {
    return (
      <main className="p-6 min-h-screen">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
              <div className="h-5 bg-gray-800 rounded animate-pulse w-2/3" />
              <div className="h-16 bg-gray-800 rounded animate-pulse" />
              <div className="h-16 bg-gray-800 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </main>
    );
  }

  if (visibleColumns.length === 0) {
    return (
      <main className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
        <span className="text-4xl mb-3">🖥️</span>
        <p className="text-base">Nenhum projeto ativo.</p>
        <p className="text-sm mt-1">Inicie o Claude Code.</p>
      </main>
    );
  }

  return (
    <main className="p-6 min-h-screen">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
        {visibleColumns.map(col => (
          <ProjectColumn
            key={col.project.id}
            project={col.project}
            agents={col.agents}
            lastEventMessage={lastEventMessage}
          />
        ))}
      </div>
    </main>
  );
}
