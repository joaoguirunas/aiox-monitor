'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from './useWebSocket';
import type { WsTerminalUpdate, WsTerminalRemoved } from '@/lib/types';
import type { TerminalsResponse, TerminalWithMeta } from '@/app/api/terminals/route';

export function useTerminals(projectId?: number | null) {
  const [terminals, setTerminals] = useState<TerminalWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const { lastMessage, reconnectCount } = useWebSocket();
  const hasFetched = useRef(false);

  const doFetch = useCallback(() => {
    const params = new URLSearchParams();
    if (projectId) params.set('project_id', String(projectId));

    fetch(`/api/terminals?${params}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((result: TerminalsResponse) => {
        setTerminals(result.terminals);
        if (!hasFetched.current) {
          hasFetched.current = true;
          setLoading(false);
        }
      })
      .catch(() => {
        if (!hasFetched.current) {
          setTerminals([]);
          setLoading(false);
          hasFetched.current = true;
        }
      });
  }, [projectId]);

  // Initial fetch + re-fetch when project changes
  useEffect(() => {
    hasFetched.current = false;
    setLoading(true);
    doFetch();
  }, [doFetch]);

  // Refetch on WebSocket reconnection (may have missed terminal updates)
  useEffect(() => {
    if (reconnectCount === 0) return;
    doFetch();
  }, [reconnectCount, doFetch]);

  // Real-time updates for terminals
  useEffect(() => {
    if (!lastMessage || lastMessage.type !== 'terminal:update') return;
    const msg = lastMessage as WsTerminalUpdate;
    if (projectId && msg.projectId !== projectId) return;

    setTerminals(prev => {
      const updated = prev.map(t =>
        t.id === msg.terminal.id ? { ...msg.terminal, project_name: t.project_name } as TerminalWithMeta : t,
      );
      const exists = updated.some(t => t.id === msg.terminal.id);
      if (!exists) updated.unshift({ ...msg.terminal } as TerminalWithMeta);
      return updated;
    });
  }, [lastMessage, projectId]);

  // Real-time removal of deactivated/purged terminals
  useEffect(() => {
    if (!lastMessage || lastMessage.type !== 'terminal:removed') return;
    const msg = lastMessage as WsTerminalRemoved;
    if (projectId && msg.projectId !== projectId) return;

    setTerminals(prev => prev.filter(t => t.id !== msg.terminalId));
  }, [lastMessage, projectId]);

  const refresh = useCallback(() => doFetch(), [doFetch]);

  return { terminals, loading, refresh };
}
