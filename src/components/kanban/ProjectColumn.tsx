'use client';

import type { Agent, Project, WsEventNew } from '@/lib/types';
import { AgentCard } from './AgentCard';

interface ProjectColumnProps {
  project: Project;
  agents: Agent[];
  lastEventMessage: WsEventNew | null;
}

export function ProjectColumn({ project, agents, lastEventMessage }: ProjectColumnProps) {
  const activeCount = agents.filter(a => a.status === 'working').length;

  return (
    <section
      aria-label={`Projeto ${project.name}`}
      className="flex flex-col gap-3 min-w-[280px] max-w-[340px]"
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-blue/60" />
          <h2 className="text-[13px] font-semibold text-text-primary truncate font-display" title={project.name}>
            {project.name}
          </h2>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {activeCount > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-accent-emerald/10 text-2xs font-medium text-accent-emerald">
              {activeCount} ativo{activeCount !== 1 ? 's' : ''}
            </span>
          )}
          <span className="text-2xs text-text-muted">
            {agents.length} agente{agents.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Agent cards */}
      <div className="flex flex-col gap-2">
        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-text-muted bg-surface-1/30 rounded-xl border border-border/50 border-dashed">
            <span className="text-xl opacity-30 mb-1.5">◉</span>
            <p className="text-2xs">Nenhum agente ativo</p>
          </div>
        ) : (
          agents.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              flashTrigger={
                lastEventMessage?.agentId === agent.id
                  ? lastEventMessage.event.id
                  : 0
              }
            />
          ))
        )}
      </div>
    </section>
  );
}
