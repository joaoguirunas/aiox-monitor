'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Project, WsProjectUpdate } from '@/lib/types';
import { useWebSocket } from './useWebSocket';

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const { lastMessage, reconnectCount } = useWebSocket();

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Fetch — re-runs on manual refresh or WebSocket reconnection
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/projects')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: Project[]) => {
        if (cancelled) return;
        setProjects(data ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setProjects([]);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshKey, reconnectCount]);

  // Real-time project updates via WebSocket
  useEffect(() => {
    if (!lastMessage || lastMessage.type !== 'project:update') return;
    const msg = lastMessage as WsProjectUpdate;
    setProjects(prev => {
      const exists = prev.some(p => p.id === msg.project.id);
      if (exists) {
        return prev.map(p => p.id === msg.project.id ? msg.project : p);
      }
      // New project — add to list
      return [msg.project, ...prev];
    });
  }, [lastMessage]);

  return { projects, loading, refresh };
}
