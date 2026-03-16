'use client';

import { useState, useEffect } from 'react';
import type { Agent, AgentStatus } from '@/lib/types';

const STATUS_DOT: Record<AgentStatus, string> = {
  working: 'bg-emerald-400',
  idle:    'bg-zinc-500',
  break:   'bg-amber-400',
  offline: 'bg-zinc-700',
};

const AGENT_COLORS: Record<string, string> = {
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

interface AgentCardProps {
  agent: Agent;
  flashTrigger?: number;
  variant?: 'chip' | 'card';
}

export function AgentCard({ agent, flashTrigger = 0, variant = 'chip' }: AgentCardProps) {
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (flashTrigger === 0) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 500);
    return () => clearTimeout(t);
  }, [flashTrigger]);

  const agentColor = AGENT_COLORS[agent.name] ?? '#6366f1';
  const displayName = agent.display_name ?? agent.name;
  const initial = displayName.charAt(0).toUpperCase();

  if (variant === 'card') {
    return (
      <div
        className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-surface-2/50 border border-border/40 transition-colors duration-150 ${flash ? 'border-accent-blue/30' : ''}`}
      >
        {/* Avatar */}
        <span
          className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-md text-[11px] font-bold text-white/90"
          style={{ backgroundColor: agentColor }}
        >
          {initial}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-text-primary truncate">{displayName}</p>
          {agent.current_tool && (
            <p className="text-[11px] text-text-muted font-mono truncate mt-0.5">
              {agent.current_tool}
            </p>
          )}
        </div>

        {/* Pulse */}
        <span className="relative flex-shrink-0">
          <span className="block w-2 h-2 rounded-full bg-emerald-400" />
          <span className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-status-pulse" />
        </span>
      </div>
    );
  }

  // Chip variant — compact horizontal pill
  return (
    <span
      className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-surface-2/40 border border-border/30 transition-colors duration-150 hover:bg-surface-2/60 ${flash ? 'border-accent-blue/30' : ''}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[agent.status]}`} />
      <span
        className="text-[12px] font-medium truncate max-w-[120px]"
        style={{ color: agentColor }}
      >
        {displayName}
      </span>
    </span>
  );
}
