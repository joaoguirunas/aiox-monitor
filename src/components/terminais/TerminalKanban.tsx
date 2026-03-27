'use client';

import type { Terminal } from '@/lib/types';
import type { TerminalWithMeta } from '@/app/api/terminals/route';
import { TrackedTerminalCard } from './TerminalCard';

interface TerminalKanbanProps {
  terminals: TerminalWithMeta[];
  onTerminalClick?: (t: Terminal) => void;
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

function cleanWindowTitle(raw: string): string {
  return raw
    .replace(/^[\u2800-\u28FF\u2702-\u27B0\u2702-\u27B0✳●◉◈⬤☐☑✓✔✕✖✗✘⚡⏳🔄\s]+/u, '')
    .trim() || raw.trim();
}

function InactiveChip({ terminal }: { terminal: TerminalWithMeta }) {
  const title = terminal.window_title ? cleanWindowTitle(terminal.window_title) : `PID ${terminal.pid}`;
  return (
    <span className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-surface-2/40 border border-border/30 hover:bg-surface-2/60 transition-colors">
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 shrink-0" />
      <span className="text-[12px] text-text-secondary truncate max-w-[140px]">{title}</span>
      <span className="text-[10px] text-text-muted/50 shrink-0">{timeAgo(terminal.last_active)}</span>
    </span>
  );
}

function TerminalCardWrapper({ terminal }: { terminal: TerminalWithMeta }) {
  return (
    <TrackedTerminalCard
      id={terminal.id}
      pid={terminal.pid}
      status={terminal.status}
      projectName={terminal.project_name}
      windowTitle={terminal.window_title}
      agentName={terminal.agent_name}
      agentDisplayName={terminal.agent_display_name}
      currentTool={terminal.current_tool}
      currentInput={terminal.current_input}
      currentToolDetail={terminal.current_tool_detail}
      waitingPermission={terminal.waiting_permission}
      autopilot={terminal.autopilot}
      firstSeen={terminal.first_seen_at}
      lastActive={terminal.last_active}
    />
  );
}

export function TerminalKanban({ terminals }: TerminalKanbanProps) {
  const processing = terminals.filter(t => t.status === 'processing');
  const active = terminals.filter(t => t.status === 'active');
  const inactive = terminals.filter(t => t.status === 'inactive');

  return (
    <div className="grid grid-cols-[1fr_1fr_1fr] divide-x divide-border/20">
      {/* Trabalhando */}
      <StatusColumn
        label="Trabalhando"
        dot="bg-emerald-400"
        dotAnimate
        count={processing.length}
        highlight
      >
        {processing.length > 0 && (
          <div className="flex flex-col gap-2">
            {processing.map(t => <TerminalCardWrapper key={t.id} terminal={t} />)}
          </div>
        )}
      </StatusColumn>

      {/* Ativos */}
      <StatusColumn
        label="Ativos"
        dot="bg-accent-blue"
        count={active.length}
      >
        {active.length > 0 && (
          <div className="flex flex-col gap-2">
            {active.map(t => <TerminalCardWrapper key={t.id} terminal={t} />)}
          </div>
        )}
      </StatusColumn>

      {/* Disponíveis */}
      <StatusColumn
        label="Disponíveis"
        dot="bg-zinc-500"
        count={inactive.length}
      >
        {inactive.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {inactive.map(t => <InactiveChip key={t.id} terminal={t} />)}
          </div>
        )}
      </StatusColumn>
    </div>
  );
}

function StatusColumn({ label, dot, dotAnimate, count, highlight, children }: {
  label: string;
  dot: string;
  dotAnimate?: boolean;
  count: number;
  highlight?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`px-4 py-3 ${highlight && count > 0 ? 'bg-emerald-400/[0.03]' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${dot} ${dotAnimate && count > 0 ? 'animate-pulse' : ''}`} />
          <span className="text-[11px] font-medium text-text-secondary">{label}</span>
        </div>
        <span className="text-[11px] tabular-nums text-text-muted">{count}</span>
      </div>
      {count === 0 ? (
        <p className="text-[11px] text-text-muted/30 py-2">Nenhum</p>
      ) : children}
    </div>
  );
}
