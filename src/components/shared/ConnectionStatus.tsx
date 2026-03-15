'use client';
import { useWebSocket } from '@/hooks/useWebSocket';

interface ConnectionStatusProps {
  connected?: boolean;
}

export function ConnectionStatus({ connected: connectedProp }: ConnectionStatusProps) {
  const { connected: wsConnected } = useWebSocket();
  const connected = connectedProp !== undefined ? connectedProp : wsConnected;

  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-400">
      <span
        className={`inline-block w-2 h-2 rounded-full ${
          connected ? 'bg-green-500' : 'bg-gray-500'
        }`}
      />
      {connected ? 'conectado' : 'desconectado'}
    </div>
  );
}
