'use client';

import { useKanban } from '@/hooks/useKanban';
import { ProjectColumn } from '@/components/kanban/ProjectColumn';
import type { WsEventNew } from '@/lib/types';

export default function KanbanPage() {
  const { columns, lastMessage } = useKanban();

  const lastEventMessage =
    lastMessage?.type === 'event:new' ? (lastMessage as WsEventNew) : null;

  if (columns.length === 0) {
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
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-0">
        {columns.map(col => (
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
