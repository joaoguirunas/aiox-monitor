'use client';

import { useState, useEffect } from 'react';
import { useProjects } from './useProjects';
import { useAgents } from './useAgents';
import { useWebSocket } from './useWebSocket';
import type { Agent, WsAgentUpdate, WsEventNew } from '@/lib/types';

export function useKanban() {
  const { projects, loading: projectsLoading } = useProjects();
  const { agents, loading: agentsLoading } = useAgents(); // no project filter — all agents
  const { lastMessage } = useWebSocket();
  const [agentState, setAgentState] = useState<Record<number, Agent>>({});

  // Initialise map from initial fetch
  useEffect(() => {
    const map: Record<number, Agent> = {};
    agents.forEach(a => { map[a.id] = a; });
    setAgentState(map);
  }, [agents]);

  // Patch individual agent via WS
  useEffect(() => {
    if (lastMessage?.type !== 'agent:update') return;
    const { agent } = lastMessage as WsAgentUpdate;
    setAgentState(prev => ({ ...prev, [agent.id]: agent }));
  }, [lastMessage]);

  // Filter to projects active in the last 24h and group agents
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const columns = projects
    .filter(p => p.last_active >= oneDayAgo)
    .map(project => ({
      project,
      agents: Object.values(agentState)
        .filter(a => a.project_id === project.id)
        .sort((a, b) => {
          if (a.status === 'working' && b.status !== 'working') return -1;
          if (b.status === 'working' && a.status !== 'working') return 1;
          // secondary: most recently active first
          return b.last_active.localeCompare(a.last_active);
        }),
    }));

  const loading = projectsLoading || agentsLoading;

  return { columns, loading, lastMessage };
}
