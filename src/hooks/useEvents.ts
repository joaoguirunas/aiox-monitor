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
  const { lastMessage } = useWebSocket();

  const filtersKey = JSON.stringify(filters);

  // Initial fetch — re-runs when filters change
  useEffect(() => {
    setLoading(true);
    const qs = buildQueryString(JSON.parse(filtersKey) as EventFilters);
    fetch(`/api/events?${qs}`)
      .then((r) => r.json())
      .then((data: { events: Event[]; total: number }) => {
        setEvents(data.events ?? []);
        setTotal(data.total ?? 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [filtersKey]);

  // Real-time updates via WebSocket
  useEffect(() => {
    if (!lastMessage || lastMessage.type !== 'event:new') return;
    const msg = lastMessage as WsEventNew;
    // Only update if matches active project filter (or no filter set)
    const parsedFilters = JSON.parse(filtersKey) as EventFilters;
    if (parsedFilters.projectId && msg.projectId !== parsedFilters.projectId) return;
    setEvents(prev => [msg.event, ...prev].slice(0, parsedFilters.limit ?? 100));
    setTotal(prev => prev + 1);
  }, [lastMessage, filtersKey]);

  return { events, loading, total };
}
