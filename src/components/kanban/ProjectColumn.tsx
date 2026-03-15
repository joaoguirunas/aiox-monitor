'use client';

import type { Agent, Project, WsEventNew } from '@/lib/types';
import { AgentCard } from './AgentCard';

interface ProjectColumnProps {
  project: Project;
  agents: Agent[];
  /** Last event:new message — used to trigger flash on relevant agent cards */
  lastEventMessage: WsEventNew | null;
}

export function ProjectColumn({ project, agents, lastEventMessage }: ProjectColumnProps) {
  const activeCount = agents.filter(a => a.status === 'working').length;

  return (
    <section
      aria-label={`Projeto ${project.name}`}
      className="flex flex-col gap-3 min-w-[280px] max-w-[320px]"
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-gray-200 truncate" title={project.name}>
          {project.name}
        </h2>
        <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
          {activeCount > 0 ? (
            <span className="text-green-400">{activeCount} ativo{activeCount !== 1 ? 's' : ''}</span>
          ) : (
            <span>{agents.length} agente{agents.length !== 1 ? 's' : ''}</span>
          )}
        </span>
      </div>

      {/* Agent cards */}
      <div className="flex flex-col gap-2">
        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-600 bg-gray-800/40 rounded-lg">
            <span className="text-2xl mb-1">😴</span>
            <p className="text-xs">Nenhum agente ativo</p>
          </div>
        ) : (
          agents.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              // Use event.id as trigger — unique per event, fires flash once per real event
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
