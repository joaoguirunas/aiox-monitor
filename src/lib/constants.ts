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

/** Generate a consistent HSL color from any agent name string */
export function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 60%, 55%)`;
}

/** Get agent color: known AIOX agents use fixed palette, custom agents get hashed color */
export function getAgentColor(name: string | null | undefined): string {
  if (!name) return '#4a5272';
  return AGENT_COLORS[name] ?? hashColor(name);
}
