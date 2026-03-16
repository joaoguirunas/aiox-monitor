import type { Event, Terminal } from '@/lib/types';
import { EventTypeBadge, AgentBadge } from '@/components/shared/Badge';
import { TimeAgo } from '@/components/shared/TimeAgo';

interface EventRowProps {
  event: Event;
  agentName?: string | null;
  agentDisplayName?: string | null;
  projectName?: string;
  terminal?: Terminal;
  onClick: () => void;
}

/** Generates a human-readable summary for tool events */
function humanizeTool(tool: string | undefined | null, input: string | undefined | null): string {
  if (!tool || !input) return input?.slice(0, 80) ?? '—';

  const short = (s: string, max = 60) => s.length > max ? s.slice(0, max) + '…' : s;

  switch (tool) {
    case 'Read':
      return `Leu ${short(input.replace(/^\/.*\//, '…/'), 70)}`;
    case 'Write':
      return `Escreveu ${short(input.replace(/^\/.*\//, '…/'), 70)}`;
    case 'Edit':
      return `Editou ${short(input.replace(/^\/.*\//, '…/'), 70)}`;
    case 'Bash':
      // Extract the first command/binary name for context
      { const cmd = input.split(/\s+/)[0]?.replace(/^.*\//, '') ?? '';
        const knownCmds: Record<string, string> = {
          npm: 'Executou npm', npx: 'Executou npx', node: 'Executou node',
          git: 'Executou git', curl: 'Fez request HTTP', docker: 'Executou docker',
          pip: 'Executou pip', python3: 'Executou python', python: 'Executou python',
          cd: 'Navegou diretório', ls: 'Listou diretório', mkdir: 'Criou diretório',
          cat: 'Leu ficheiro', rm: 'Removeu ficheiro', mv: 'Moveu ficheiro',
          cp: 'Copiou ficheiro', tsc: 'Verificou tipos',
        };
        return knownCmds[cmd] ?? `Executou: ${short(input, 70)}`; }
    case 'Grep':
      return `Pesquisou "${short(input, 50)}"`;
    case 'Glob':
      return `Procurou ficheiros: ${short(input, 50)}`;
    case 'Agent':
      return `Lançou sub-agente`;
    case 'Skill':
      return `Executou skill: ${short(input, 50)}`;
    case 'WebSearch':
      return `Pesquisou na web: ${short(input, 50)}`;
    case 'WebFetch':
      return `Fetched URL`;
    default:
      return short(input, 70);
  }
}

function humanizeStop(input: string | undefined | null): string {
  if (!input) return 'Resposta concluída';
  return input.length > 80 ? input.slice(0, 80) + '…' : input;
}

export function EventRow({
  event,
  agentName,
  agentDisplayName,
  projectName,
  terminal,
  onClick,
}: EventRowProps) {
  const isPrompt = event.type === 'UserPromptSubmit';
  const isStop = event.type === 'Stop' || event.type === 'SubagentStop';
  const isTool = event.type === 'PreToolUse' || event.type === 'PostToolUse';

  let summaryText: string;
  if (isPrompt) {
    summaryText = event.input_summary
      ? event.input_summary.slice(0, 80) + (event.input_summary.length > 80 ? '…' : '')
      : '—';
  } else if (isStop) {
    summaryText = humanizeStop(event.input_summary);
  } else if (isTool) {
    summaryText = humanizeTool(event.tool, event.input_summary);
  } else {
    summaryText = event.input_summary?.slice(0, 80) ?? '—';
  }

  return (
    <tr
      className="border-b border-border/20 hover:bg-white/[0.02] cursor-pointer transition-colors duration-150 group"
      onClick={onClick}
    >
      <td className="px-4 py-2.5 whitespace-nowrap">
        <TimeAgo dateStr={event.created_at} />
      </td>
      <td className="px-4 py-2.5 text-[13px] text-text-secondary max-w-[140px] truncate">
        {projectName ?? <span className="text-text-muted">—</span>}
      </td>
      <td className="px-4 py-2.5">
        {agentName ? (
          <AgentBadge name={agentName} displayName={agentDisplayName} />
        ) : (
          <span className="text-text-muted text-[13px]">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        {terminal ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary" title={`PID ${terminal.pid}${terminal.window_title ? ` — ${terminal.window_title}` : ''}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${terminal.status === 'processing' ? 'bg-accent-emerald animate-pulse' : terminal.status === 'active' ? 'bg-accent-amber' : 'bg-text-muted/40'}`} />
            <span className="truncate max-w-[120px]">{terminal.window_title || `PID ${terminal.pid}`}</span>
          </span>
        ) : (
          <span className="text-text-muted text-[11px]">—</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <EventTypeBadge type={event.type} />
      </td>
      <td className="px-4 py-2.5 text-[13px] text-accent-blue/70 font-mono">
        {event.tool ?? <span className="text-text-muted">—</span>}
      </td>
      <td className="px-4 py-2.5 text-[13px] truncate">
        <span className={
          isPrompt
            ? 'text-accent-violet/80'
            : isStop
              ? 'text-accent-emerald/70'
              : isTool
                ? 'text-text-secondary text-2xs'
                : 'text-text-muted'
        }>
          {summaryText}
        </span>
      </td>
    </tr>
  );
}
