'use client';

import { useState, useEffect } from 'react';
import type { Event, EventFilters, WsEventNew } from '@/lib/types';
import { useWebSocket } from './useWebSocket';

function buildQueryString(filters: EventFilters): string {
  const params = new URLSearchParams();
  if (filters.projectId !== undefined) params.set('project_id', String(filters.projectId));
  if (filters.agentId !== undefined) params.set('agent_id', String(filters.agentId));
  if (filters.terminalId !== undefined) params.set('terminal_id', String(filters.terminalId));
  if (filters.type !== undefined) params.set('type', filters.type);
  if (filters.since !== undefined) params.set('since', filters.since);
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters.offset !== undefined) params.set('offset', String(filters.offset));
  return params.toString();
}

export function useEvents(filters: EventFilters = {}) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const { lastMessage, reconnectCount } = useWebSocket();

  const filtersKey = JSON.stringify(filters);

  const refresh = () => setRefreshKey((k) => k + 1);

  // Initial fetch — re-runs when filters change, manual refresh, or WebSocket reconnects
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = buildQueryString(JSON.parse(filtersKey) as EventFilters);
    fetch(`/api/events?${qs}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { events: Event[]; total: number }) => {
        if (cancelled) return;
        setEvents(data.events ?? []);
        setTotal(data.total ?? 0);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setEvents([]);
        setTotal(0);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [filtersKey, refreshKey, reconnectCount]);

  // Real-time updates via WebSocket — with deduplication
  useEffect(() => {
    if (!lastMessage || lastMessage.type !== 'event:new') return;
    const msg = lastMessage as WsEventNew;
    const parsedFilters = JSON.parse(filtersKey) as EventFilters;
    if (parsedFilters.projectId && msg.projectId !== parsedFilters.projectId) return;
    if (parsedFilters.agentId && msg.agentId !== parsedFilters.agentId) return;
    if (parsedFilters.terminalId && msg.event.terminal_id !== parsedFilters.terminalId) return;
    setEvents(prev => {
      // Deduplicate: skip if event already exists
      if (prev.some(e => e.id === msg.event.id)) return prev;
      return [msg.event, ...prev];
    });
    setTotal(prev => prev + 1);
  }, [lastMessage, filtersKey]);

  return { events, loading, total, refresh };
}
