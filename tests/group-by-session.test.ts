import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Event } from '../src/lib/types';
import { groupBySession } from '../src/components/lista/SessionRow';

function makeEvent(overrides: Partial<Event> & { id: number; type: Event['type'] }): Event {
  return {
    project_id: 1,
    created_at: '2026-03-18 10:00:00',
    ...overrides,
  };
}

describe('groupBySession', () => {

  it('AC6 — empty events array returns empty groups', () => {
    const groups = groupBySession([]);
    assert.equal(groups.length, 0);
  });

  it('AC7 — orphan events (session_id null) each become their own group', () => {
    const events: Event[] = [
      makeEvent({ id: 1, type: 'PreToolUse', session_id: undefined, tool: 'Read' }),
      makeEvent({ id: 2, type: 'PreToolUse', session_id: undefined, tool: 'Edit' }),
    ];

    const groups = groupBySession(events);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].sessionId, null);
    assert.equal(groups[1].sessionId, null);
    // Each orphan has its own events
    assert.equal(groups[0].events.length, 1);
    assert.equal(groups[1].events.length, 1);
  });

  it('AC8 — session without Stop event → isComplete = false', () => {
    const events: Event[] = [
      makeEvent({ id: 1, type: 'UserPromptSubmit', session_id: 10, input_summary: 'do something' }),
      makeEvent({ id: 2, type: 'PreToolUse', session_id: 10, tool: 'Read' }),
      makeEvent({ id: 3, type: 'PostToolUse', session_id: 10, tool: 'Read' }),
    ];

    const groups = groupBySession(events);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].isComplete, false);
    assert.equal(groups[0].prompt, 'do something');
    assert.equal(groups[0].response, null);
  });

  it('AC9 — session with SubagentStop → isComplete = true', () => {
    const events: Event[] = [
      makeEvent({ id: 1, type: 'UserPromptSubmit', session_id: 20, input_summary: 'deploy' }),
      makeEvent({ id: 2, type: 'PreToolUse', session_id: 20, tool: 'Bash' }),
      makeEvent({ id: 3, type: 'SubagentStop', session_id: 20, input_summary: 'Deployed OK' }),
    ];

    const groups = groupBySession(events);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].isComplete, true);
    assert.equal(groups[0].response, 'Deployed OK');
  });

  it('groups events by session_id correctly', () => {
    const events: Event[] = [
      makeEvent({ id: 1, type: 'UserPromptSubmit', session_id: 1, input_summary: 'hello' }),
      makeEvent({ id: 2, type: 'Stop', session_id: 1, input_summary: 'bye' }),
      makeEvent({ id: 3, type: 'UserPromptSubmit', session_id: 2, input_summary: 'start' }),
    ];

    const groups = groupBySession(events);
    assert.equal(groups.length, 2);

    const g1 = groups.find((g) => g.sessionId === 1)!;
    const g2 = groups.find((g) => g.sessionId === 2)!;

    assert.equal(g1.events.length, 2);
    assert.equal(g1.isComplete, true);
    assert.equal(g2.events.length, 1);
    assert.equal(g2.isComplete, false);
  });

  it('counts tools correctly', () => {
    const events: Event[] = [
      makeEvent({ id: 1, type: 'PreToolUse', session_id: 5, tool: 'Read' }),
      makeEvent({ id: 2, type: 'PostToolUse', session_id: 5, tool: 'Read' }),
      makeEvent({ id: 3, type: 'PreToolUse', session_id: 5, tool: 'Edit' }),
      makeEvent({ id: 4, type: 'PreToolUse', session_id: 5, tool: 'Read' }),
    ];

    const groups = groupBySession(events);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].toolCount, 3); // 3 PreToolUse events
    assert.ok(groups[0].tools.includes('Read'));
    assert.ok(groups[0].tools.includes('Edit'));
    assert.equal(groups[0].tools.length, 2); // unique tools
  });
});
