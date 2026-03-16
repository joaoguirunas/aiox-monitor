'use client';

import type { Agent, Project, WsEventNew } from '@/lib/types';
import { AgentCard } from './AgentCard';

interface ProjectRowProps {
  project: Project;
  agents: Agent[];
  lastEventMessage: WsEventNew | null;
}

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

function categorizeAgents(agents: Agent[]) {
  const now = Date.now();
  const working: Agent[] = [];
  const active: Agent[] = [];
  const available: Agent[] = [];

  for (const agent of agents) {
    if (agent.status === 'working') {
      working.push(agent);
    } else {
      const lastActive = new Date(agent.last_active).getTime();
      if (now - lastActive <= TWELVE_HOURS_MS) {
        active.push(agent);
      } else {
        available.push(agent);
      }
    }
  }

  const byRecent = (a: Agent, b: Agent) => b.last_active.localeCompare(a.last_active);
  working.sort(byRecent);
  active.sort(byRecent);
  available.sort(byRecent);

  return { working, active, available };
}

function getFlashTrigger(agent: Agent, msg: WsEventNew | null): number {
  return msg?.agentId === agent.id ? msg.event.id : 0;
}

export function ProjectRow({ project, agents, lastEventMessage }: ProjectRowProps) {
  const { working, active, available } = categorizeAgents(agents);

  return (
    <section aria-label={`Projeto ${project.name}`} className="rounded-xl bg-surface-1/30 border border-border/40 overflow-hidden">
      {/* Project header bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/30 bg-surface-1/40">
        <div className="flex items-center gap-3">
          <h2 className="text-[13px] font-semibold text-text-primary font-display">
            {project.name}
          </h2>
          <span className="text-[11px] text-text-muted">
            {agents.length} agente{agents.length !== 1 ? 's' : ''}
          </span>
        </div>
        {working.length > 0 && (
          <span className="text-[11px] font-medium text-emerald-400/80">
            {working.length} trabalhando
          </span>
        )}
      </div>

      {/* Content: 3 sections */}
      <div className="grid grid-cols-[1fr_1fr_1fr] divide-x divide-border/20">
        {/* Disponíveis */}
        <StatusColumn
          label="Disponíveis"
          dot="bg-zinc-500"
          count={available.length}
        >
          {available.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {available.map(a => (
                <AgentCard key={a.id} agent={a} variant="chip" flashTrigger={getFlashTrigger(a, lastEventMessage)} />
              ))}
            </div>
          )}
        </StatusColumn>

        {/* Ativos */}
        <StatusColumn
          label="Ativos"
          dot="bg-accent-blue"
          count={active.length}
        >
          {active.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {active.map(a => (
                <AgentCard key={a.id} agent={a} variant="chip" flashTrigger={getFlashTrigger(a, lastEventMessage)} />
              ))}
            </div>
          )}
        </StatusColumn>

        {/* Trabalhando */}
        <StatusColumn
          label="Trabalhando"
          dot="bg-emerald-400"
          count={working.length}
          highlight
        >
          {working.length > 0 && (
            <div className="flex flex-col gap-2">
              {working.map(a => (
                <AgentCard key={a.id} agent={a} variant="card" flashTrigger={getFlashTrigger(a, lastEventMessage)} />
              ))}
            </div>
          )}
        </StatusColumn>
      </div>
    </section>
  );
}

function StatusColumn({ label, dot, count, highlight, children }: {
  label: string;
  dot: string;
  count: number;
  highlight?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`px-4 py-3 ${highlight && count > 0 ? 'bg-emerald-400/[0.03]' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
          <span className="text-[11px] font-medium text-text-secondary">
            {label}
          </span>
        </div>
        <span className="text-[11px] tabular-nums text-text-muted">{count}</span>
      </div>

      {/* Content */}
      {count === 0 ? (
        <p className="text-[11px] text-text-muted/30 py-2">Nenhum</p>
      ) : (
        children
      )}
    </div>
  );
}
