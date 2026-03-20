'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Event, EventFilters, WsEventNew } from '@/lib/types';
import { useWebSocket } from './useWebSocket';

function buildQueryString(filters: EventFilters): string {
  const params = new URLSearchParams();
  if (filters.projectId !== undefined) params.set('project_id', String(filters.projectId));
  if (filters.agentId !== undefined) params.set('agent_id', String(filters.agentId));
  if (filters.terminalId !== undefined) params.set('terminal_id', String(filters.terminalId));
  if (filters.type !== undefined) params.set('type', filters.type);
  if (filters.since !== undefined) params.set('since', filters.since);
  if (filters.until !== undefined) params.set('until', filters.until);
  if (filters.search !== undefined) params.set('search', filters.search);
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters.offset !== undefined) params.set('offset', String(filters.offset));
  return params.toString();
}

export function useEvents(filters: EventFilters = {}) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const { lastMessage, reconnectCount } = useWebSocket();

  const filtersKey = JSON.stringify(filters);
  const hasMore = events.length < total;

  const refresh = () => setRefreshKey((k) => k + 1);

  // Skip fetching when filters are empty (session view active — QA Concern C1 fix)
  const enabled = Object.keys(filters).length > 0;

  // Initial fetch — re-runs when filters change, manual refresh, or WebSocket reconnects
  useEffect(() => {
    if (!enabled) {
      setEvents([]);
      setTotal(0);
      setLoading(false);
      return;
    }
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
        // On error, keep existing data — don't wipe the list
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [filtersKey, refreshKey, reconnectCount, enabled]);

  // Load more — appends older events
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || !enabled) return;
    setLoadingMore(true);
    const baseFilters = JSON.parse(filtersKey) as EventFilters;
    const qs = buildQueryString({ ...baseFilters, offset: events.length });
    fetch(`/api/events?${qs}`)
      .then((r) => r.json())
      .then((data: { events: Event[]; total: number }) => {
        setEvents((prev) => [...prev, ...data.events]);
        setTotal(data.total);
        setLoadingMore(false);
      })
      .catch(() => {
        setLoadingMore(false);
      });
  }, [filtersKey, events.length, loadingMore, hasMore, enabled]);

  // Real-time updates via WebSocket — with deduplication
  useEffect(() => {
    if (!enabled) return;
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
  }, [lastMessage, filtersKey, enabled]);

  return { events, loading, loadingMore, total, hasMore, loadMore, refresh };
}
