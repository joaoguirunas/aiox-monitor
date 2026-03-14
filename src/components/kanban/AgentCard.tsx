'use client';

import { useState, useEffect } from 'react';
import type { Agent, AgentStatus } from '@/lib/types';

const STATUS_STYLES: Record<AgentStatus, string> = {
  working: 'bg-green-500 animate-pulse',
  idle:    'bg-gray-500',
  break:   'bg-yellow-500',
  offline: 'bg-red-900',
};

const STATUS_LABELS: Record<AgentStatus, string> = {
  working: 'working',
  idle:    'idle',
  break:   'break',
  offline: 'offline',
};

interface AgentCardProps {
  agent: Agent;
  /** Increment this value to trigger a flash highlight */
  flashTrigger?: number;
}

export function AgentCard({ agent, flashTrigger = 0 }: AgentCardProps) {
  const [flash, setFlash] = useState(false);

  // Flash on new event for this agent
  useEffect(() => {
    if (flashTrigger === 0) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 600);
    return () => clearTimeout(t);
  }, [flashTrigger]);

  return (
    <article
      aria-label={`Agente ${agent.display_name ?? agent.name}`}
      className={`
        bg-gray-800 rounded-lg p-3 transition-all duration-150
        ${flash ? 'ring-2 ring-blue-400' : ''}
      `}
    >
      {/* Header: name + status badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-100 truncate">
            {agent.display_name ?? agent.name}
          </p>
          <p className="text-xs text-gray-500 truncate">{agent.name}</p>
        </div>
        <span
          aria-label={`Status: ${STATUS_LABELS[agent.status]}`}
          className={`flex-shrink-0 inline-block w-2.5 h-2.5 rounded-full ${STATUS_STYLES[agent.status]}`}
        />
      </div>

      {/* Current tool — only when working */}
      {agent.status === 'working' && agent.current_tool && (
        <p className="mt-1.5 text-xs text-blue-400 truncate">
          ⚙ {agent.current_tool}
        </p>
      )}

      {/* Status label */}
      <p className="mt-1 text-xs text-gray-500 capitalize">{STATUS_LABELS[agent.status]}</p>
    </article>
  );
}
