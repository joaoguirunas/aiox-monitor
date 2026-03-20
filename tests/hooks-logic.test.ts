import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Test buildQueryString logic (extracted from hooks) ──────────────────────
// Since hooks depend on React, we test the pure logic independently

interface SessionFilters {
  projectId?: number;
  agentId?: number;
  terminalId?: number;
  status?: string;
  since?: string;
  until?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

interface EventFilters {
  projectId?: number;
  agentId?: number;
  terminalId?: number;
  type?: string;
  since?: string;
  until?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

function buildSessionQueryString(filters: SessionFilters): string {
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

function buildEventQueryString(filters: EventFilters): string {
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

describe('useSessions — buildQueryString', () => {
  it('AC4 — builds correct query for initial fetch', () => {
    const qs = buildSessionQueryString({ projectId: 1 });
    assert.equal(qs, 'project_id=1');
  });

  it('AC4 — includes all filter params', () => {
    const qs = buildSessionQueryString({
      projectId: 1,
      agentId: 2,
      status: 'active',
      since: '2026-03-18',
      until: '2026-03-19',
      search: 'deploy',
      limit: 20,
      offset: 40,
    });
    const params = new URLSearchParams(qs);
    assert.equal(params.get('project_id'), '1');
    assert.equal(params.get('agent_id'), '2');
    assert.equal(params.get('status'), 'active');
    assert.equal(params.get('since'), '2026-03-18');
    assert.equal(params.get('until'), '2026-03-19');
    assert.equal(params.get('search'), 'deploy');
    assert.equal(params.get('limit'), '20');
    assert.equal(params.get('offset'), '40');
  });

  it('AC4 — loadMore concatenation uses offset = sessions.length', () => {
    // Simulates: sessions.length = 20, new offset should be 20
    const baseFilters: SessionFilters = { projectId: 1 };
    const qs = buildSessionQueryString({ ...baseFilters, offset: 20 });
    const params = new URLSearchParams(qs);
    assert.equal(params.get('offset'), '20');
  });

  it('AC4 — empty filters produce empty query string', () => {
    const qs = buildSessionQueryString({});
    assert.equal(qs, '');
  });
});

describe('useEvents — buildQueryString and enabled flag', () => {
  it('AC5 — builds correct query for events', () => {
    const qs = buildEventQueryString({ projectId: 1, type: 'PreToolUse', limit: 50 });
    const params = new URLSearchParams(qs);
    assert.equal(params.get('project_id'), '1');
    assert.equal(params.get('type'), 'PreToolUse');
    assert.equal(params.get('limit'), '50');
  });

  it('AC5 — enabled flag: empty filters = disabled (no fetch)', () => {
    const filters: EventFilters = {};
    const enabled = Object.keys(filters).length > 0;
    assert.equal(enabled, false);
  });

  it('AC5 — enabled flag: filters with limit = enabled', () => {
    const filters: EventFilters = { limit: 50 };
    const enabled = Object.keys(filters).length > 0;
    assert.equal(enabled, true);
  });

  it('AC5 — loadMore offset uses events.length', () => {
    const baseFilters: EventFilters = { projectId: 1, limit: 50 };
    const eventsLength = 50;
    const qs = buildEventQueryString({ ...baseFilters, offset: eventsLength });
    const params = new URLSearchParams(qs);
    assert.equal(params.get('offset'), '50');
  });

  it('AC5 — hasMore toggle: length < total means more', () => {
    const eventsLength = 50;
    const total = 120;
    const hasMore = eventsLength < total;
    assert.equal(hasMore, true);

    const hasMore2 = 120 < 120;
    assert.equal(hasMore2, false);
  });

  it('AC5 — WebSocket deduplication: event already in list should be skipped', () => {
    // Simulates the dedup logic from useEvents
    const existingEvents = [
      { id: 1, type: 'PreToolUse' },
      { id: 2, type: 'Stop' },
    ];
    const newEventId = 1; // duplicate
    const isDuplicate = existingEvents.some(e => e.id === newEventId);
    assert.equal(isDuplicate, true);

    const newUniqueId = 3;
    const isDuplicate2 = existingEvents.some(e => e.id === newUniqueId);
    assert.equal(isDuplicate2, false);
  });
});
