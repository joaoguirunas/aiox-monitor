'use client';

import { useState, useEffect, useRef } from 'react';
import { useProjects } from './useProjects';
import { useAgents } from './useAgents';
import { useWebSocket } from './useWebSocket';
import type { Agent, WsAgentUpdate } from '@/lib/types';

export function useKanban() {
  const { projects, loading: projectsLoading, refresh: refreshProjects } = useProjects();
  const { agents, loading: agentsLoading, refresh: refreshAgents } = useAgents(); // no project filter — all agents
  const { lastMessage, reconnectCount } = useWebSocket();
  const [agentState, setAgentState] = useState<Record<number, Agent>>({});
  const fetchVersionRef = useRef(0);

  // Merge fetched agents into state — preserve WS updates for agents not in the fetch response
  useEffect(() => {
    fetchVersionRef.current++;
    setAgentState(prev => {
      const merged: Record<number, Agent> = {};
      // Start with fresh fetch data
      agents.forEach(a => { merged[a.id] = a; });
      // For agents NOT in the fetch but present via WS, keep them
      for (const [idStr, agent] of Object.entries(prev)) {
        const id = Number(idStr);
        if (!(id in merged)) {
          merged[id] = agent;
        }
      }
      return merged;
    });
  }, [agents]);

  // Patch individual agent via WS
  useEffect(() => {
    if (lastMessage?.type !== 'agent:update') return;
    const { agent } = lastMessage as WsAgentUpdate;
    setAgentState(prev => ({ ...prev, [agent.id]: agent }));
  }, [lastMessage]);

  // Refetch on WebSocket reconnection (may have missed events)
  useEffect(() => {
    if (reconnectCount === 0) return;
    refreshProjects();
    refreshAgents();
  }, [reconnectCount, refreshProjects, refreshAgents]);

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

  const refresh = () => { refreshProjects(); refreshAgents(); };

  return { columns, loading, lastMessage, refresh };
}
