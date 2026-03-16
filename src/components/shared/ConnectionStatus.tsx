'use client';
import { useWebSocket } from '@/hooks/useWebSocket';

interface ConnectionStatusProps {
  connected?: boolean;
}

export function ConnectionStatus({ connected: connectedProp }: ConnectionStatusProps) {
  const { connected: wsConnected } = useWebSocket();
  const connected = connectedProp !== undefined ? connectedProp : wsConnected;

  return (
    <div className="flex items-center gap-2 text-2xs">
      <span className="relative flex items-center justify-center">
        <span
          className={`inline-block w-2 h-2 rounded-full transition-colors duration-300 ${
            connected ? 'bg-accent-emerald' : 'bg-text-muted'
          }`}
        />
        {connected && (
          <span className="absolute inset-0 w-2 h-2 rounded-full bg-accent-emerald/40 animate-status-pulse" />
        )}
      </span>
      <span className={connected ? 'text-accent-emerald/80' : 'text-text-muted'}>
        {connected ? 'live' : 'offline'}
      </span>
    </div>
  );
}
