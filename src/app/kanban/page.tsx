'use client';

import { useState, useCallback } from 'react';
import { useKanban } from '@/hooks/useKanban';
import { useProjectContext } from '@/contexts/ProjectContext';
import { ProjectRow } from '@/components/kanban/ProjectRow';
import { AgentDetailPanel } from '@/components/kanban/AgentDetailPanel';
import type { Agent, WsEventNew } from '@/lib/types';

export default function KanbanPage() {
  const { columns, loading, lastMessage, refresh } = useKanban();
  const { selectedProjectId } = useProjectContext();
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  const handleAgentClick = useCallback((agent: Agent) => {
    setSelectedAgent(agent);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedAgent(null);
  }, []);

  const lastEventMessage =
    lastMessage?.type === 'event:new' ? (lastMessage as WsEventNew) : null;

  const visibleColumns = selectedProjectId
    ? columns.filter(col => col.project.id === selectedProjectId)
    : columns;

  if (loading) {
    return (
      <main className="w-full px-4 py-5">
        <div className="space-y-5">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-surface-1/30 border border-border/40 overflow-hidden">
              <div className="px-5 py-3 border-b border-border/30">
                <div className="h-3.5 shimmer rounded w-36" />
              </div>
              <div className="grid grid-cols-3 divide-x divide-border/20">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="px-4 py-3">
                    <div className="h-3 shimmer rounded w-20 mb-3" />
                    <div className="flex gap-1.5">
                      <div className="h-7 shimmer rounded-md w-20" />
                      <div className="h-7 shimmer rounded-md w-16" />
                      <div className="h-7 shimmer rounded-md w-24" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    );
  }

  if (visibleColumns.length === 0) {
    return (
      <main className="flex flex-col items-center justify-center min-h-[60vh]">
        <p className="text-sm text-text-secondary font-medium">Nenhum projeto ativo</p>
        <p className="text-[11px] text-text-muted mt-1.5">Inicie o Claude Code para monitorizar</p>
      </main>
    );
  }

  const totalAgents = visibleColumns.reduce((sum, col) => sum + col.agents.length, 0);

  return (
    <main className="w-full px-4 py-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-semibold text-text-primary font-display">
            Agentes
          </h1>
          <span className="text-[11px] text-text-muted">
            {totalAgents} em {visibleColumns.length} projeto{visibleColumns.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="px-2.5 py-1 text-[11px] font-medium text-text-muted hover:text-text-secondary rounded-md border border-border/50 hover:border-border transition-colors disabled:opacity-30"
        >
          Atualizar
        </button>
      </div>

      {/* Project rows */}
      <div className="space-y-5">
        {visibleColumns.map(col => (
          <ProjectRow
            key={col.project.id}
            project={col.project}
            agents={col.agents}
            lastEventMessage={lastEventMessage}
            onAgentClick={handleAgentClick}
          />
        ))}
      </div>
      {/* Agent Detail Panel */}
      {selectedAgent && (
        <AgentDetailPanel
          key={selectedAgent.id}
          agent={selectedAgent}
          onClose={handleClosePanel}
        />
      )}
    </main>
  );
}
