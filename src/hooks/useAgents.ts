'use client';

import { useState, useEffect } from 'react';
import type { AgentWithStats, WsAgentUpdate } from '@/lib/types';
import { useWebSocket } from './useWebSocket';

export function useAgents(projectId?: number) {
  const [agents, setAgents] = useState<AgentWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const { lastMessage } = useWebSocket();

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    const qs = projectId !== undefined ? `?project_id=${projectId}` : '';
    fetch(`/api/agents${qs}`)
      .then((r) => r.json())
      .then((data: AgentWithStats[]) => {
        setAgents(data ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  // Real-time updates via WebSocket
  useEffect(() => {
    if (!lastMessage || lastMessage.type !== 'agent:update') return;
    const msg = lastMessage as WsAgentUpdate;
    if (projectId !== undefined && msg.projectId !== projectId) return;
    setAgents(prev =>
      prev.map(a => a.id === msg.agent.id ? { ...a, ...msg.agent } : a)
    );
  }, [lastMessage, projectId]);

  return { agents, loading };
}
