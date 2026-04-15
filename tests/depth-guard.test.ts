import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DepthGuard, MAX_DEPTH } from '../src/server/agent-bus/depth-guard.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Dispatch N sequential hops: card0→card1→card2→…→cardN */
function chainHops(guard: DepthGuard, conversationId: string, n: number): void {
  for (let i = 0; i < n; i++) {
    guard.markDispatched(conversationId, `card-${i}`, `card-${i + 1}`);
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DepthGuard', () => {
  let guard: DepthGuard;

  beforeEach(() => {
    guard = new DepthGuard();
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('happy path — single dispatch is allowed', () => {
    const result = guard.canDispatch('conv-1', 'agent-A', 'agent-B');
    assert.equal(result.ok, true);
    assert.equal(result.depth, 1);
    assert.equal(result.reason, undefined);
  });

  it('happy path — markDispatched increments depth for subsequent canDispatch', () => {
    guard.markDispatched('conv-1', 'agent-A', 'agent-B');
    const result = guard.canDispatch('conv-1', 'agent-B', 'agent-C');
    assert.equal(result.ok, true);
    assert.equal(result.depth, 2);
  });

  // ── MAX_DEPTH boundary ──────────────────────────────────────────────────────

  it(`3 hops (MAX_DEPTH=${MAX_DEPTH}) are all allowed`, () => {
    for (let hop = 1; hop <= MAX_DEPTH; hop++) {
      const sender = `card-${hop - 1}`;
      const target = `card-${hop}`;
      const result = guard.canDispatch('conv-depth', sender, target);
      assert.equal(result.ok, true, `hop ${hop} should be ok`);
      assert.equal(result.depth, hop, `depth should equal hop number`);
      guard.markDispatched('conv-depth', sender, target);
    }
  });

  it('4th hop is blocked with max_depth_exceeded', () => {
    // Exhaust the 3 allowed hops.
    chainHops(guard, 'conv-block', MAX_DEPTH);

    const result = guard.canDispatch('conv-block', `card-${MAX_DEPTH}`, 'card-extra');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'max_depth_exceeded');
    assert.equal(result.depth, MAX_DEPTH + 1);
  });

  it('canDispatch does not mutate state — repeated calls return same depth', () => {
    guard.markDispatched('conv-1', 'A', 'B');

    const first = guard.canDispatch('conv-1', 'B', 'C');
    const second = guard.canDispatch('conv-1', 'B', 'C');
    assert.equal(first.depth, second.depth);
    assert.equal(first.ok, second.ok);
  });

  // ── Chief exemption ─────────────────────────────────────────────────────────

  it('Chief is exempt — can dispatch beyond MAX_DEPTH', () => {
    // Saturate depth.
    chainHops(guard, 'conv-chief', MAX_DEPTH);

    // Chief can still dispatch.
    const result = guard.canDispatch(
      'conv-chief',
      'chief-card',
      'some-agent',
      { isChief: true },
    );
    assert.equal(result.ok, true);
    assert.equal(result.reason, undefined);
  });

  it('Chief dispatch reports correct depth even when exempt', () => {
    chainHops(guard, 'conv-chief', MAX_DEPTH + 5);

    const result = guard.canDispatch(
      'conv-chief',
      'chief-card',
      'some-agent',
      { isChief: true },
    );
    assert.equal(result.ok, true);
    assert.equal(result.depth, MAX_DEPTH + 5 + 1);
  });

  it('non-Chief at same depth is still blocked', () => {
    chainHops(guard, 'conv-mixed', MAX_DEPTH);

    const blocked = guard.canDispatch('conv-mixed', 'regular-card', 'another');
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, 'max_depth_exceeded');
  });

  // ── clearConversation ───────────────────────────────────────────────────────

  it('clearConversation resets depth to 0', () => {
    chainHops(guard, 'conv-clear', MAX_DEPTH);

    // Verify blocked before clear.
    assert.equal(guard.canDispatch('conv-clear', 'X', 'Y').ok, false);

    guard.clearConversation('conv-clear');

    // After clear, should be allowed again.
    const result = guard.canDispatch('conv-clear', 'X', 'Y');
    assert.equal(result.ok, true);
    assert.equal(result.depth, 1);
  });

  it('clearConversation on unknown id is a no-op', () => {
    assert.doesNotThrow(() => guard.clearConversation('nonexistent-conv'));
  });

  // ── Multiple conversations isolated ────────────────────────────────────────

  it('conversations are isolated — saturating one does not affect another', () => {
    chainHops(guard, 'conv-A', MAX_DEPTH);

    // conv-B is fresh.
    const result = guard.canDispatch('conv-B', 'agent-X', 'agent-Y');
    assert.equal(result.ok, true);
    assert.equal(result.depth, 1);
  });

  it('conversations track depth independently', () => {
    guard.markDispatched('conv-1', 'A', 'B'); // conv-1: depth 1
    guard.markDispatched('conv-2', 'A', 'B'); // conv-2: depth 1
    guard.markDispatched('conv-2', 'B', 'C'); // conv-2: depth 2

    const r1 = guard.canDispatch('conv-1', 'B', 'C');
    const r2 = guard.canDispatch('conv-2', 'C', 'D');

    assert.equal(r1.depth, 2); // conv-1 next hop is 2
    assert.equal(r2.depth, 3); // conv-2 next hop is 3
    assert.equal(r1.ok, true);
    assert.equal(r2.ok, true);
  });

  it('clearing one conversation does not affect another', () => {
    chainHops(guard, 'conv-A', MAX_DEPTH);
    chainHops(guard, 'conv-B', MAX_DEPTH);

    guard.clearConversation('conv-A');

    // conv-A is reset.
    assert.equal(guard.canDispatch('conv-A', 'X', 'Y').ok, true);
    // conv-B is still blocked.
    assert.equal(guard.canDispatch('conv-B', 'X', 'Y').ok, false);
  });
});
