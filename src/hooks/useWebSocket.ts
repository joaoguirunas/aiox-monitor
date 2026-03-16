'use client';

import { useState, useEffect } from 'react';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import type { WsIncomingMessage } from '@/lib/types';

/**
 * Shared WebSocket hook — subscribes to the single WebSocketProvider connection.
 * Each consumer gets its OWN lastMessage state, so no messages are lost
 * due to React batching (unlike a shared context state approach).
 */
export function useWebSocket() {
  const { connected, reconnectCount, subscribe } = useWebSocketContext();
  const [lastMessage, setLastMessage] = useState<WsIncomingMessage | null>(null);

  useEffect(() => {
    const unsub = subscribe((msg) => {
      setLastMessage(msg);
    });
    return unsub;
  }, [subscribe]);

  return { connected, lastMessage, reconnectCount };
}
