'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SessionWithSummary, SessionFilters, WsEventNew } from '@/lib/types';
import { useWebSocket } from './useWebSocket';

function buildQueryString(filters: SessionFilters): string {
  const params = new URLSearchParams();
  if (filters.projectId !== undefined) params.set('project_id', String(filters.projectId));
  if (filters.agentId !== undefined) params.set('agent_id', String(filters.agentId));
  if (filters.terminalId !== undefined) params.set('terminal_id', String(filters.terminalId));
  if (filters.status !== undefined) params.set('status', filters.status);
  if (filters.since !== undefined) params.set('since', filters.since);
  if (filters.until !== undefined) params.set('until', filters.until);
  if (filters.search !== undefined) params.set('search', filters.search);
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters.offset !== undefined) params.set('offset', String(filters.offset));
  return params.toString();
}

export function useSessions(filters: SessionFilters = {}) {
  const [sessions, setSessions] = useState<SessionWithSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const { lastMessage, reconnectCount } = useWebSocket();

  const limit = filters.limit ?? 20;
  const filtersKey = JSON.stringify(filters);
  const hasMore = sessions.length < total;

  const refresh = () => setRefreshKey((k) => k + 1);

  // Initial fetch — re-runs when filters change, manual refresh, or WebSocket reconnects
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = buildQueryString(JSON.parse(filtersKey) as SessionFilters);
    fetch(`/api/sessions?${qs}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { sessions: SessionWithSummary[]; total: number }) => {
        if (cancelled) return;
        setSessions(data.sessions ?? []);
        setTotal(data.total ?? 0);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [filtersKey, refreshKey, reconnectCount]);

  // Load more — appends older sessions
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const baseFilters = JSON.parse(filtersKey) as SessionFilters;
    const qs = buildQueryString({ ...baseFilters, offset: sessions.length });
    fetch(`/api/sessions?${qs}`)
      .then((r) => r.json())
      .then((data: { sessions: SessionWithSummary[]; total: number }) => {
        setSessions((prev) => [...prev, ...data.sessions]);
        setTotal(data.total);
        setLoadingMore(false);
      })
      .catch(() => {
        setLoadingMore(false);
      });
  }, [filtersKey, sessions.length, loadingMore, hasMore]);

  // Real-time updates via WebSocket
  useEffect(() => {
    if (!lastMessage || lastMessage.type !== 'event:new') return;
    const msg = lastMessage as WsEventNew;
    const parsedFilters = JSON.parse(filtersKey) as SessionFilters;
    if (parsedFilters.projectId && msg.projectId !== parsedFilters.projectId) return;

    const sessionId = msg.event.session_id;
    if (!sessionId) return;

    setSessions((prev) => {
      const idx = prev.findIndex((s) => s.id === sessionId);
      if (idx >= 0) {
        // Patch existing session — increment event_count, update tools/response
        const updated = [...prev];
        const session = { ...updated[idx] };
        session.event_count = session.event_count + 1;

        if (msg.event.tool && !session.tools.includes(msg.event.tool)) {
          session.tools = [...session.tools, msg.event.tool];
        }
        if (msg.event.type === 'PreToolUse') {
          session.tool_count = session.tool_count + 1;
        }
        if (msg.event.type === 'Stop' || msg.event.type === 'SubagentStop') {
          session.response = msg.event.input_summary ?? session.response;
          session.status = 'completed';
          session.ended_at = msg.event.created_at;
        }

        updated[idx] = session;
        return updated;
      }
      // New session — refetch will be triggered by incrementing refreshKey
      return prev;
    });

    // If it's a new session we don't have, trigger a refresh
    setSessions((prev) => {
      if (sessionId && !prev.some((s) => s.id === sessionId)) {
        // Trigger refresh on next tick to get new session from server
        setTimeout(() => setRefreshKey((k) => k + 1), 500);
      }
      return prev;
    });
  }, [lastMessage, filtersKey]);

  return { sessions, loading, loadingMore, total, hasMore, loadMore, refresh };
}
