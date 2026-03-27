import { PIXELLAB_SPRITES } from '@/game/data/pixellab-sprites';
import type { EventType } from '@/lib/types';

const EVENT_TYPE_STYLES: Record<EventType, string> = {
  PreToolUse: 'bg-accent-blue/10 text-accent-blue border-accent-blue/20',
  PostToolUse: 'bg-accent-emerald/10 text-accent-emerald border-accent-emerald/20',
  UserPromptSubmit: 'bg-accent-violet/10 text-accent-violet border-accent-violet/20',
  Stop: 'bg-surface-3 text-text-muted border-border',
  SubagentStop: 'bg-accent-amber/10 text-accent-amber border-accent-amber/20',
};

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  PreToolUse: 'Ação',
  PostToolUse: 'Resultado',
  UserPromptSubmit: 'Prompt',
  Stop: 'Resposta',
  SubagentStop: 'Sub-Resposta',
};

interface EventTypeBadgeProps {
  type: EventType;
}

export function EventTypeBadge({ type }: EventTypeBadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium border ${EVENT_TYPE_STYLES[type]}`}>
      {EVENT_TYPE_LABELS[type]}
    </span>
  );
}

// Agent color mapping (inline styles for dynamic agent colors)
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

function getAgentColor(name: string | null | undefined): string {
  if (!name) return '#4a5272';
  return AGENT_COLORS[name] ?? '#4a5272';
}

interface AgentBadgeProps {
  name: string | null | undefined;
  displayName?: string | null;
}

export function AgentBadge({ name, displayName }: AgentBadgeProps) {
  const label = displayName ?? name ?? 'unknown';
  const color = getAgentColor(name);
  const initial = label.charAt(0).toUpperCase();
  const spritePath = name ? PIXELLAB_SPRITES[name]?.directions.south : undefined;

  return (
    <span className="inline-flex items-center gap-1.5 text-2xs font-semibold">
      {spritePath ? (
        <span
          className="flex items-center justify-center w-5 h-5 rounded-full overflow-hidden border-2 shrink-0"
          style={{ borderColor: color }}
        >
          <img src={spritePath} alt={label} className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} />
        </span>
      ) : (
        <span
          className="flex items-center justify-center rounded-full text-[9px] font-bold text-white/90 shrink-0"
          style={{ backgroundColor: color, width: '18px', height: '18px', fontSize: '9px' }}
        >
          {initial}
        </span>
      )}
      <span style={{ color }}>{label}</span>
    </span>
  );
}
