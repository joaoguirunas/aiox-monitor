'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AgentWithStats, WsAgentUpdate } from '@/lib/types';
import { useWebSocket } from './useWebSocket';

export function useAgents(projectId?: number) {
  const [agents, setAgents] = useState<AgentWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const { lastMessage, reconnectCount } = useWebSocket();

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Initial fetch — re-runs on filter change, manual refresh, or WebSocket reconnect
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = projectId !== undefined ? `?project_id=${projectId}` : '';
    fetch(`/api/agents${qs}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: AgentWithStats[]) => {
        if (cancelled) return;
        setAgents(data ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setAgents([]);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [projectId, refreshKey, reconnectCount]);

  // Real-time updates via WebSocket
  useEffect(() => {
    if (!lastMessage || lastMessage.type !== 'agent:update') return;
    const msg = lastMessage as WsAgentUpdate;
    if (projectId !== undefined && msg.projectId !== projectId) return;
    setAgents(prev => {
      const exists = prev.some(a => a.id === msg.agent.id);
      if (exists) {
        return prev.map(a => a.id === msg.agent.id ? { ...a, ...msg.agent } : a);
      }
      // New agent appeared — add to list
      return [...prev, { ...msg.agent, terminal_count: 0 } as AgentWithStats];
    });
  }, [lastMessage, projectId]);

  return { agents, loading, refresh };
}
