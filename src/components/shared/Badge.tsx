import type { EventType } from '@/lib/types';
import { getAgentBgColor } from '@/components/empresa/config/agent-colors';

const EVENT_TYPE_STYLES: Record<EventType, string> = {
  PreToolUse: 'bg-blue-900 text-blue-300 border border-blue-700',
  PostToolUse: 'bg-green-900 text-green-300 border border-green-700',
  UserPromptSubmit: 'bg-purple-900 text-purple-300 border border-purple-700',
  Stop: 'bg-gray-800 text-gray-400 border border-gray-600',
  SubagentStop: 'bg-orange-900 text-orange-300 border border-orange-700',
};

interface EventTypeBadgeProps {
  type: EventType;
}

export function EventTypeBadge({ type }: EventTypeBadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${EVENT_TYPE_STYLES[type]}`}>
      {type}
    </span>
  );
}

interface AgentBadgeProps {
  name: string | null | undefined;
  displayName?: string | null;
}

export function AgentBadge({ name, displayName }: AgentBadgeProps) {
  const label = displayName ?? name ?? 'unknown';
  const bg = getAgentBgColor(name);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold text-white ${bg}`}>
      {label}
    </span>
  );
}
