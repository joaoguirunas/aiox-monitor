'use client';
import { useWebSocket } from '@/hooks/useWebSocket';

interface ConnectionStatusProps {
  connected?: boolean;
}

export function ConnectionStatus({ connected: connectedProp }: ConnectionStatusProps) {
  const { connected: wsConnected } = useWebSocket();
  const connected = connectedProp !== undefined ? connectedProp : wsConnected;

  return (
    <div className="flex items-center gap-1.5">
      <span className="relative flex items-center justify-center">
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
            connected ? 'bg-emerald-400' : 'bg-zinc-600'
          }`}
        />
        {connected && (
          <span className="absolute inset-0 w-1.5 h-1.5 rounded-full bg-emerald-400/40 animate-status-pulse" />
        )}
      </span>
      <span className={`text-[10px] font-medium ${connected ? 'text-emerald-400/70' : 'text-text-muted/50'}`}>
        {connected ? 'live' : 'offline'}
      </span>
    </div>
  );
}
