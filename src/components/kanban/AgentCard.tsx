'use client';

import { useState, useEffect } from 'react';
import type { Agent, AgentWithStats } from '@/lib/types';
import { AGENT_COLORS, STATUS_DOT } from '@/lib/constants';

interface AgentCardProps {
  agent: Agent | AgentWithStats;
  flashTrigger?: number;
  variant?: 'chip' | 'card';
  onClick?: (agent: Agent) => void;
}

export function AgentCard({ agent, flashTrigger = 0, variant = 'chip', onClick }: AgentCardProps) {
  const terminalCount = 'terminal_count' in agent ? (agent as AgentWithStats).terminal_count : 0;
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (flashTrigger === 0) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 500);
    return () => clearTimeout(t);
  }, [flashTrigger]);

  const agentColor = AGENT_COLORS[agent.name] ?? '#FF4400';
  const displayName = agent.display_name ?? agent.name;
  const initial = displayName.charAt(0).toUpperCase();

  if (variant === 'card') {
    return (
      <div
        className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-surface-2/50 border border-border/40 transition-colors duration-150 ${flash ? 'border-accent-orange/30' : ''} ${onClick ? 'cursor-pointer hover:border-border/60' : ''}`}
        onClick={onClick ? () => onClick(agent) : undefined}
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
          {(agent.current_tool_detail || agent.current_tool) && (
            <p className="text-[11px] text-text-muted font-mono truncate mt-0.5" title={agent.current_tool_detail ?? agent.current_tool}>
              {(agent.current_tool_detail ?? agent.current_tool ?? '').length > 40
                ? `${(agent.current_tool_detail ?? agent.current_tool ?? '').slice(0, 40)}…`
                : (agent.current_tool_detail ?? agent.current_tool)}
            </p>
          )}
          {agent.waiting_permission === 1 && (
            <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-400/15 text-amber-400 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Aguarda permissão
            </span>
          )}
        </div>

        {/* Terminal count + Pulse */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {terminalCount > 1 && (
            <span
              className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-surface-3 text-[10px] font-medium text-text-secondary"
              title={`${terminalCount} terminais activos`}
            >
              {terminalCount}
            </span>
          )}
          <span className="relative">
            <span className="block w-2 h-2 rounded-full bg-emerald-400" />
            <span className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-status-pulse" />
          </span>
        </div>
      </div>
    );
  }

  // Chip variant — compact horizontal pill
  return (
    <span
      className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-surface-2/40 border border-border/30 transition-colors duration-150 hover:bg-surface-2/60 ${flash ? 'border-accent-orange/30' : ''} ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick ? () => onClick(agent) : undefined}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[agent.status]}`} />
      <span
        className="text-[12px] font-medium truncate max-w-[120px]"
        style={{ color: agentColor }}
      >
        {displayName}
      </span>
      {terminalCount > 1 && (
        <span
          className="text-[10px] font-medium text-text-secondary bg-surface-3 rounded-full px-1 flex-shrink-0"
          title={`${terminalCount} terminais activos`}
        >
          x{terminalCount}
        </span>
      )}
      {agent.waiting_permission === 1 && (
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" title="Aguarda permissão" />
      )}
    </span>
  );
}
