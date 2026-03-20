import type { AgentStatus } from './types';

export const AGENT_COLORS: Record<string, string> = {
  '@dev': '#6366f1',
  '@qa': '#34d399',
  '@architect': '#a78bfa',
  '@pm': '#fb923c',
  '@sm': '#22d3ee',
  '@po': '#fbbf24',
  '@analyst': '#818cf8',
  '@devops': '#f87171',
  '@data-engineer': '#f472b6',
  '@ux-design-expert': '#e879f9',
  '@aiox-master': '#fbbf24',
};

export const STATUS_DOT: Record<AgentStatus, string> = {
  working: 'bg-emerald-400',
  idle: 'bg-zinc-500',
  break: 'bg-amber-400',
  offline: 'bg-zinc-700',
};

export const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
