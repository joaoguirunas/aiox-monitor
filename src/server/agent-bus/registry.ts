/**
 * AgentBus Registry — JOB-046
 *
 * In-memory runtime state for active agent_cards.
 * Tracks started/stopped/busy status and card metadata needed for dispatch.
 *
 * Intentionally separate from DB state:
 *   - DB state = persisted truth (agent_cards.status)
 *   - Registry = transient runtime (process handle, lock, last-seen)
 *
 * Singleton — survives across API route invocations in the same Node.js process.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type RuntimeStatus = 'idle' | 'busy' | 'stopped';

export interface AgentRuntimeState {
  cardId: string;
  displayName: string;
  kind: 'chat' | 'terminal' | 'hybrid';
  /** Terminal name used with `maestri ask {terminalName}` */
  terminalName: string | null;
  projectPath: string | null;
  skillPath: string | null;
  isChief: boolean;
  status: RuntimeStatus;
  /** ISO timestamp of last dispatch */
  lastDispatchAt: string | null;
  /** Number of in-flight dispatches (for busy detection) */
  inflight: number;
}

// ─── Singleton registry ───────────────────────────────────────────────────────

const _registry = new Map<string, AgentRuntimeState>();

/** Register or update a card's runtime state. */
export function registerCard(state: Omit<AgentRuntimeState, 'status' | 'lastDispatchAt' | 'inflight'>): void {
  const existing = _registry.get(state.cardId);
  _registry.set(state.cardId, {
    ...state,
    status: existing?.status ?? 'idle',
    lastDispatchAt: existing?.lastDispatchAt ?? null,
    inflight: existing?.inflight ?? 0,
  });
}

/** Remove a card from the registry (e.g. on DELETE agent_card). */
export function unregisterCard(cardId: string): void {
  _registry.delete(cardId);
}

/** Get current runtime state for a card. Returns undefined if not registered. */
export function getRuntime(cardId: string): AgentRuntimeState | undefined {
  return _registry.get(cardId);
}

/** Mark a card as busy (dispatch started). */
export function markBusy(cardId: string): void {
  const s = _registry.get(cardId);
  if (!s) return;
  s.inflight++;
  s.status = 'busy';
  s.lastDispatchAt = new Date().toISOString();
}

/** Mark a card as idle (dispatch completed). */
export function markIdle(cardId: string): void {
  const s = _registry.get(cardId);
  if (!s) return;
  s.inflight = Math.max(0, s.inflight - 1);
  s.status = s.inflight > 0 ? 'busy' : 'idle';
}

/** Mark a card as stopped (e.g. PTY exited). */
export function markStopped(cardId: string): void {
  const s = _registry.get(cardId);
  if (!s) return;
  s.status = 'stopped';
  s.inflight = 0;
}

/**
 * Ensure a card is registered from DB row (lazy init on first dispatch).
 * No-op if already registered.
 */
export function ensureRegistered(card: {
  id: string;
  display_name: string;
  kind: 'chat' | 'terminal' | 'hybrid';
  maestri_terminal_name: string | null;
  project_path: string | null;
  skill_path: string | null;
  is_chief: number;
}): void {
  if (_registry.has(card.id)) return;
  registerCard({
    cardId: card.id,
    displayName: card.display_name,
    kind: card.kind,
    terminalName: card.maestri_terminal_name,
    projectPath: card.project_path,
    skillPath: card.skill_path,
    isChief: card.is_chief === 1,
  });
}

/** List all registered cards (for debugging / health checks). */
export function listRegistry(): AgentRuntimeState[] {
  return [..._registry.values()];
}
