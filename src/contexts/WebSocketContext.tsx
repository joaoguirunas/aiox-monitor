'use client';

import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { WsIncomingMessage } from '@/lib/types';

function getWsUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:8888/ws';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

const MAX_RETRIES = 20;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

type MessageListener = (msg: WsIncomingMessage) => void;

interface WebSocketContextValue {
  connected: boolean;
  reconnectCount: number;
  /** Subscribe to all incoming messages. Returns unsubscribe function. */
  subscribe: (listener: MessageListener) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue>({
  connected: false,
  reconnectCount: 0,
  subscribe: () => () => {},
});

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);
  const wasConnectedRef = useRef(false);
  const listenersRef = useRef<Set<MessageListener>>(new Set());

  const subscribe = useCallback((listener: MessageListener) => {
    listenersRef.current.add(listener);
    return () => { listenersRef.current.delete(listener); };
  }, []);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) { ws.close(); return; }
      setConnected(true);
      if (wasConnectedRef.current) {
        setReconnectCount(c => c + 1);
      }
      wasConnectedRef.current = true;
      retriesRef.current = 0;
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as WsIncomingMessage;
        if (msg.type === 'ping') return;
        // Notify ALL subscribers directly — no React state, no batching issues
        for (const listener of listenersRef.current) {
          try { listener(msg); } catch { /* isolate listener errors */ }
        }
      } catch { /* ignore malformed messages */ }
    };

    ws.onclose = () => {
      if (unmountedRef.current) return;
      setConnected(false);
      if (retriesRef.current < MAX_RETRIES) {
        const delay = Math.min(BASE_DELAY_MS * Math.pow(2, retriesRef.current), MAX_DELAY_MS);
        retriesRef.current++;
        timeoutRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    connect();
    return () => {
      unmountedRef.current = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return (
    <WebSocketContext.Provider value={{ connected, reconnectCount, subscribe }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext() {
  return useContext(WebSocketContext);
}
