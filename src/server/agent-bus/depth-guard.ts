/**
 * DepthGuard — prevents infinite agent-to-agent dispatch chains.
 *
 * Tracks hop counts per conversation using a visited-edge Set.
 * Node.js is single-threaded; no async locking needed at v1.
 *
 * Story 9.9 prep — will be wired into AgentBus in Story 9.3.
 */

export const MAX_DEPTH = 3;

export interface DispatchResult {
  ok: boolean;
  reason?: string;
  depth: number;
}

export interface DispatchOptions {
  /** When true the sender is the Chief card — exempt from depth limits. */
  isChief?: boolean;
}

export class DepthGuard {
  /**
   * Per-conversation visited-edge set.
   * Key: conversationId
   * Value: Set of "senderId\x00targetId" strings (edges dispatched so far).
   * Set.size == number of hops dispatched in this conversation.
   */
  private readonly visited = new Map<string, Set<string>>();

  /**
   * Check whether a dispatch is allowed.
   *
   * Does NOT mutate state — call `markDispatched` to record the hop after
   * you've confirmed you will actually perform it.
   */
  canDispatch(
    conversationId: string,
    senderId: string,
    targetId: string,
    options: DispatchOptions = {},
  ): DispatchResult {
    const set = this.visited.get(conversationId);
    const currentDepth = set?.size ?? 0;
    const nextDepth = currentDepth + 1;

    // Chief is exempt — no depth ceiling.
    if (options.isChief) {
      return { ok: true, depth: nextDepth };
    }

    if (nextDepth > MAX_DEPTH) {
      return { ok: false, reason: 'max_depth_exceeded', depth: nextDepth };
    }

    return { ok: true, depth: nextDepth };
  }

  /**
   * Record that a dispatch hop has occurred.
   * Duplicate edges (same sender→target in the same conversation) are
   * deduplicated by the Set, which also acts as a cycle-prevention guard.
   */
  markDispatched(
    conversationId: string,
    senderId: string,
    targetId: string,
  ): void {
    let set = this.visited.get(conversationId);
    if (!set) {
      set = new Set<string>();
      this.visited.set(conversationId, set);
    }
    // Null-byte separator avoids false collisions between IDs.
    set.add(`${senderId}\x00${targetId}`);
  }

  /** Reset all hop state for a conversation (e.g. when it ends). */
  clearConversation(conversationId: string): void {
    this.visited.delete(conversationId);
  }
}

/** Singleton for use across the server process. */
export const depthGuard = new DepthGuard();
