'use client';

import { useState, useCallback } from 'react';
import { getAgentTextColor } from '@/components/empresa/config/agent-colors';
import type { TerminalStatus } from '@/lib/types';

interface TerminalCardProps {
  id: number;
  pid: number;
  status: TerminalStatus;
  projectName?: string;
  windowTitle?: string;
  sessionId?: string;
  agentName?: string;
  agentDisplayName?: string;
  currentTool?: string;
  currentInput?: string;
  currentToolDetail?: string;
  waitingPermission?: 0 | 1;
  autopilot: 0 | 1;
  firstSeen: string;
  lastActive: string;
}

function timeAgo(iso: string): string {
  try {
    const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'agora';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  } catch {
    return iso;
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
    return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

const STATUS_DOT: Record<TerminalStatus, string> = {
  processing: 'bg-accent-orange',
  active: 'bg-emerald-400',
  inactive: 'bg-zinc-500',
};

const STATUS_LABEL: Record<TerminalStatus, string> = {
  processing: 'processando',
  active: 'ativo',
  inactive: 'inativo',
};

function cleanWindowTitle(raw: string): string {
  return raw
    .replace(/^[\u2800-\u28FF\u2702-\u27B0✳●◉◈⬤☐☑✓✔✕✖✗✘⚡⏳🔄\s]+/u, '')
    .trim() || raw.trim();
}

export function TrackedTerminalCard({
  id, pid, status, projectName, windowTitle, agentName, agentDisplayName,
  currentTool, currentInput, currentToolDetail, waitingPermission,
  autopilot, firstSeen, lastActive,
}: TerminalCardProps) {
  const [toggling, setToggling] = useState(false);
  const isOn = autopilot === 1;

  const toggleAutopilot = useCallback(async () => {
    setToggling(true);
    try {
      await fetch(`/api/terminals/${id}/autopilot`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !isOn }),
      });
    } catch { /* best-effort */ }
    setToggling(false);
  }, [id, isOn]);

  const agentColor = getAgentTextColor(agentName);
  const toolDisplay = currentTool
    ? currentInput
      ? `${currentTool}: ${currentInput.length > 50 ? currentInput.slice(0, 47) + '...' : currentInput}`
      : currentTool
    : null;

  const displayTitle = windowTitle ? cleanWindowTitle(windowTitle) : null;

  const borderClass = status === 'processing'
    ? 'border-accent-orange/20'
    : 'border-border/40';

  return (
    <div className={`rounded-lg border ${borderClass} bg-surface-1/30 transition-colors hover:bg-white/[0.02] ${status === 'inactive' ? 'opacity-50' : ''}`}>
      <div className="px-3 py-2">
        {/* Header: dot + title + PID + status + agent + autopilot — all compact */}
        <div className="flex items-center justify-between gap-1.5 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status]} ${status === 'processing' ? 'animate-pulse' : ''}`} />
            <span className="text-[12px] font-medium text-text-primary truncate">
              {displayTitle || `PID ${pid}`}
            </span>
            {displayTitle && <span className="text-[9px] font-mono text-text-muted/40 shrink-0">{pid}</span>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] text-text-muted">{STATUS_LABEL[status]}</span>
            {status !== 'inactive' && (
              <button
                onClick={toggleAutopilot}
                disabled={toggling}
                title={isOn ? 'Autopilot ON' : 'Autopilot OFF'}
                className={`
                  flex items-center gap-1 px-1.5 py-px rounded-full text-[9px] font-semibold uppercase tracking-wider
                  transition-all duration-200 disabled:opacity-50
                  ${isOn
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
                    : 'bg-zinc-700/40 text-zinc-500 border border-zinc-600/30 hover:bg-zinc-700/60 hover:text-zinc-400'
                  }
                `}
              >
                <span className={`w-1 h-1 rounded-full ${isOn ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                {isOn ? 'auto' : 'off'}
              </button>
            )}
          </div>
        </div>

        {/* Agent name */}
        {agentName && agentName !== '@unknown' && (
          <div className="mb-1">
            <span className={`text-[11px] font-medium ${agentColor}`}>
              {agentDisplayName ?? agentName}
            </span>
            {agentDisplayName && (
              <span className="text-[10px] text-text-muted ml-1">{agentName}</span>
            )}
          </div>
        )}

        {/* Tool Detail (JSONL-enriched) */}
        {currentToolDetail && (
          <div className="mb-1 px-2 py-1 rounded-md bg-accent-orange/10 border border-accent-orange/20 flex items-center gap-1.5">
            {waitingPermission === 1 && (
              <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" title="Waiting for permission" />
            )}
            <p className="text-[10px] font-mono text-accent-orange truncate">{currentToolDetail}</p>
          </div>
        )}

        {/* Permission waiting (without tool detail) */}
        {!currentToolDetail && waitingPermission === 1 && (
          <div className="mb-1 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center gap-1.5">
            <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <p className="text-[10px] font-medium text-amber-400">Aguardando permissão</p>
          </div>
        )}

        {/* Tool (fallback to old hook data) */}
        {!currentToolDetail && toolDisplay && status === 'processing' && (
          <div className="mb-1 px-2 py-1 rounded-md bg-surface-2/40 border border-border/30">
            <p className="text-[10px] font-mono text-text-muted truncate">{toolDisplay}</p>
          </div>
        )}

        {/* Metadata — single inline line */}
        <p className="text-[10px] text-text-muted truncate">
          {[projectName, formatTime(firstSeen), timeAgo(lastActive)].filter(Boolean).join(' · ')}
        </p>
      </div>
    </div>
  );
}
