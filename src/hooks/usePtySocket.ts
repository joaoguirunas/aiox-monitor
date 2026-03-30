'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { Terminal } from '@xterm/xterm';

export type PtyStatus = 'connecting' | 'active' | 'idle' | 'error' | 'closed';

interface PtyMessage {
  type: 'scrollback' | 'status' | 'exit' | 'error' | 'pong';
  data?: string;
  status?: PtyStatus;
  code?: number;
  signal?: string;
  message?: string;
}

interface UsePtySocketOptions {
  terminalId: string | null;
  terminal: Terminal | null;
  onStatusChange?: (status: PtyStatus) => void;
  onExit?: (code: number, signal?: string) => void;
  onError?: (message: string) => void;
  onIdle?: () => void;
  /** True when the terminal was restored from DB (not freshly spawned) */
  isRestored?: boolean;
}

interface UsePtySocketReturn {
  status: PtyStatus;
  sendResize: (cols: number, rows: number) => void;
  isConnected: boolean;
  startIdleWatch: () => void;
}

export function usePtySocket({
  terminalId,
  terminal,
  onStatusChange,
  onExit,
  onError,
  onIdle,
  isRestored = false,
}: UsePtySocketOptions): UsePtySocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<PtyStatus>('connecting');
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const deadRef = useRef(false); // Permanent stop flag

  // ── Stable refs for callbacks (prevents useEffect re-runs) ─────────
  const onStatusChangeRef = useRef(onStatusChange);
  const onExitRef = useRef(onExit);
  const onErrorRef = useRef(onError);
  const onIdleRef = useRef(onIdle);
  onStatusChangeRef.current = onStatusChange;
  onExitRef.current = onExit;
  onErrorRef.current = onError;
  onIdleRef.current = onIdle;

  // ── Idle watch refs ─────────────────────────────────────────────────
  const idleWatchActiveRef = useRef(false);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Update status and notify via ref
  const updateStatus = useCallback((newStatus: PtyStatus) => {
    setStatus(newStatus);
    onStatusChangeRef.current?.(newStatus);
  }, []);

  // Start idle watch: fires onIdle after 2s of no stdout activity
  const startIdleWatch = useCallback(() => {
    idleWatchActiveRef.current = true;
  }, []);

  // Send resize message to server
  const sendResize = useCallback((cols: number, rows: number) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  }, []);

  // Connect to WebSocket — only depends on terminal + terminalId
  useEffect(() => {
    if (!terminal || !terminalId) return;

    // Reset dead flag on new terminal
    deadRef.current = false;

    const connect = () => {
      if (deadRef.current) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/pty?id=${terminalId}`;

      console.log('[usePtySocket] Connecting to:', wsUrl);
      updateStatus('connecting');

      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[usePtySocket] Connected');
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        updateStatus('active');
        // If restoring a terminal from DB, ask server to reconnect to existing process
        if (isRestored && terminalId) {
          ws.send(JSON.stringify({ type: 'reconnect', terminalId }));
        }
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          const data = new Uint8Array(event.data);
          terminal.write(data);
          // Reset idle timer on each stdout chunk
          if (idleWatchActiveRef.current) {
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            idleTimerRef.current = setTimeout(() => {
              if (idleWatchActiveRef.current) {
                idleWatchActiveRef.current = false;
                onIdleRef.current?.();
              }
            }, 2000);
          }
        } else {
          try {
            const msg: PtyMessage = JSON.parse(event.data);

            switch (msg.type) {
              case 'scrollback':
                if (msg.data) {
                  terminal.write(msg.data);
                }
                break;

              case 'status':
                if (msg.status) {
                  updateStatus(msg.status);
                }
                break;

              case 'exit':
                deadRef.current = true;
                updateStatus('closed');
                onExitRef.current?.(msg.code ?? 0, msg.signal);
                break;

              case 'error':
                if (msg.message?.includes('Terminal not found')) {
                  // Permanent death — stop everything
                  deadRef.current = true;
                  updateStatus('closed');
                } else {
                  updateStatus('error');
                }
                onErrorRef.current?.(msg.message ?? 'Unknown error');
                break;

              case 'pong':
                break;
            }
          } catch (err) {
            console.error('[usePtySocket] Failed to parse message:', err);
          }
        }
      };

      ws.onerror = () => {
        if (reconnectAttemptsRef.current === 0) {
          console.error('[usePtySocket] WebSocket error for terminal:', terminalId);
        }
      };

      ws.onclose = (event) => {
        console.log('[usePtySocket] Connection closed:', event.code, event.reason);
        setIsConnected(false);
        wsRef.current = null;

        // Permanent stop conditions
        if (deadRef.current || event.code === 4004 || event.code === 1000) {
          updateStatus('closed');
          return;
        }

        // Attempt reconnection for transient failures only
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
          console.log(`[usePtySocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        } else {
          updateStatus('closed');
        }
      };

      // Send stdin from terminal to WebSocket
      const disposable = terminal.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(new TextEncoder().encode(data));
        }
      });

      return () => {
        disposable.dispose();
      };
    };

    const cleanup = connect();

    return () => {
      cleanup?.();
      deadRef.current = true;

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      idleWatchActiveRef.current = false;

      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
        wsRef.current = null;
      }
    };
  }, [terminal, terminalId, updateStatus, isRestored]);
  // ^^^ NO callbacks in deps — they use stable refs

  // Ping keep-alive every 30 seconds
  useEffect(() => {
    if (!isConnected) return;

    const pingInterval = setInterval(() => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);

    return () => clearInterval(pingInterval);
  }, [isConnected]);

  return {
    status,
    sendResize,
    isConnected,
    startIdleWatch,
  };
}
