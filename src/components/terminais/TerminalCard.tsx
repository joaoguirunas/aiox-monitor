'use client';

import { getAgentTextColor } from '@/components/empresa/config/agent-colors';
import type { TerminalStatus } from '@/lib/types';

interface TerminalCardProps {
  pid: number;
  status: TerminalStatus;
  projectName?: string;
  windowTitle?: string;
  sessionId?: string;
  agentName?: string;
  agentDisplayName?: string;
  currentTool?: string;
  currentInput?: string;
  firstSeen: string;
  lastActive: string;
}

function timeAgo(iso: string): string {
  try {
    const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'agora';
    if (mins < 60) return `${mins}m atrás`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h atrás`;
    return `${Math.floor(hours / 24)}d atrás`;
  } catch {
    return iso;
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
    return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

const STATUS_DOT: Record<TerminalStatus, string> = {
  processing: 'bg-accent-blue',
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
    .replace(/^[\u2800-\u28FF✳●◉◈⬤☐☑✓✔✕✖✗✘⚡⏳🔄\s]+/u, '')
    .trim() || raw.trim();
}

export function TrackedTerminalCard({
  pid, status, projectName, windowTitle, agentName, agentDisplayName,
  currentTool, currentInput, firstSeen, lastActive,
}: TerminalCardProps) {
  const agentColor = getAgentTextColor(agentName);
  const toolDisplay = currentTool
    ? currentInput
      ? `${currentTool}: ${currentInput.length > 50 ? currentInput.slice(0, 47) + '...' : currentInput}`
      : currentTool
    : null;

  const displayTitle = windowTitle ? cleanWindowTitle(windowTitle) : null;

  return (
    <div className={`rounded-lg border border-border/40 bg-surface-1/30 transition-colors hover:bg-white/[0.02] ${status === 'inactive' ? 'opacity-50' : ''}`}>
      <div className="px-4 py-3">
        {/* Header: Title + status */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status]} ${status === 'processing' ? 'animate-pulse' : ''}`} />
            <span className="text-[13px] font-medium text-text-primary truncate">
              {displayTitle || `PID ${pid}`}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {displayTitle && <span className="text-[10px] font-mono text-text-muted/50">{pid}</span>}
            <span className="text-[11px] text-text-muted">{STATUS_LABEL[status]}</span>
          </div>
        </div>

        {/* Agent */}
        {agentName && agentName !== '@unknown' && (
          <div className="mb-2">
            <span className={`text-[12px] font-medium ${agentColor}`}>
              {agentDisplayName ?? agentName}
            </span>
            {agentDisplayName && (
              <span className="text-[11px] text-text-muted ml-1.5">{agentName}</span>
            )}
          </div>
        )}

        {/* Tool */}
        {toolDisplay && status === 'processing' && (
          <div className="mb-2.5 px-2.5 py-1.5 rounded-md bg-surface-2/40 border border-border/30">
            <p className="text-[11px] font-mono text-text-muted truncate">{toolDisplay}</p>
          </div>
        )}

        {/* Metadata */}
        <div className="space-y-1 text-[11px]">
          {projectName && (
            <div className="flex justify-between">
              <span className="text-text-muted">Projeto</span>
              <span className="text-text-secondary">{projectName}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-text-muted">Início</span>
            <span className="text-text-secondary">{formatTime(firstSeen)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Atividade</span>
            <span className="text-text-secondary">{timeAgo(lastActive)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
