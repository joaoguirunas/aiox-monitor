import type { IPty } from 'node-pty';

// ─── Constants ───────────────────────────────────────────────────────────────

export const MAX_SCROLLBACK = 5000;
export const MAX_PROCESSES = 500;          // global ceiling
export const MAX_PROCESSES_PER_PROJECT = 20; // per-project limit
export const IDLE_TIMEOUT_MS = 60_000;
export const CLOSED_RETENTION_MS = 30_000;
export const KILL_GRACE_MS = 3_000;

// ─── Types ───────────────────────────────────────────────────────────────────

export type PtyStatus = 'spawning' | 'active' | 'idle' | 'error' | 'closed';

export interface SpawnOptions {
  agentName: string;
  projectPath: string;
  cols?: number;
  rows?: number;
  initialPrompt?: string;
  env?: Record<string, string>;
}

export interface PtyProcess {
  id: string;
  agentName: string;
  projectPath: string;
  pid: number;
  status: PtyStatus;
  cols: number;
  rows: number;
  createdAt: string;
  scrollback: string[];
  pty: IPty;
  idleTimer: ReturnType<typeof setTimeout> | null;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

export interface PtyListEntry {
  id: string;
  agentName: string;
  projectPath: string;
  pid: number;
  status: PtyStatus;
  cols: number;
  rows: number;
  createdAt: string;
}

export type ProcessEventType = 'data' | 'status' | 'exit';

export interface ProcessEvent {
  type: ProcessEventType;
  id: string;
  data?: string;
  status?: PtyStatus;
  exitCode?: number;
  signal?: string;
}
