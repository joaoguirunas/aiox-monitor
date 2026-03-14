import type { Event } from '@/lib/types';
import { EventTypeBadge, AgentBadge } from '@/components/shared/Badge';
import { TimeAgo } from '@/components/shared/TimeAgo';

interface EventRowProps {
  event: Event;
  agentName?: string | null;
  agentDisplayName?: string | null;
  projectName?: string;
  onClick: () => void;
}

export function EventRow({
  event,
  agentName,
  agentDisplayName,
  projectName,
  onClick,
}: EventRowProps) {
  const summary = event.input_summary
    ? event.input_summary.slice(0, 60) + (event.input_summary.length > 60 ? '…' : '')
    : '—';

  return (
    <tr
      className="border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <td className="px-4 py-2.5 whitespace-nowrap">
        <TimeAgo dateStr={event.created_at} />
      </td>
      <td className="px-4 py-2.5 text-sm text-gray-300 max-w-[140px] truncate">
        {projectName ?? '—'}
      </td>
      <td className="px-4 py-2.5">
        {agentName ? (
          <AgentBadge name={agentName} displayName={agentDisplayName} />
        ) : (
          <span className="text-gray-600 text-sm">—</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <EventTypeBadge type={event.type} />
      </td>
      <td className="px-4 py-2.5 text-sm text-gray-400 font-mono">
        {event.tool ?? '—'}
      </td>
      <td className="px-4 py-2.5 text-sm text-gray-500 max-w-[260px] truncate">
        {summary}
      </td>
    </tr>
  );
}
