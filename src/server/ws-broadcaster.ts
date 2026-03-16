import { WebSocketServer, WebSocket } from 'ws';

export interface WsMessage {
  type: string;
  [key: string]: unknown;
}

// Use globalThis to share the WSS instance between esbuild bundle (server.ts)
// and Next.js bundle (API routes). Without this, each bundle gets its own
// module-level `wss` variable, and broadcast() from API routes silently fails.
const g = globalThis as unknown as { __aiox_wss?: WebSocketServer };

export function setBroadcaster(server: WebSocketServer): void {
  if (g.__aiox_wss) return; // protect against double-init
  g.__aiox_wss = server;
  // Ping loop — keeps connections alive and detects dead clients
  setInterval(() => {
    broadcast({ type: 'ping' });
  }, 30_000);
}

export function broadcast(message: WsMessage): void {
  const wss = g.__aiox_wss;
  if (!wss) return;
  const json = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(json);
      } catch (err) {
        console.error('[ws] send error, terminating client:', err);
        try { client.terminate(); } catch { /* ignore */ }
      }
    }
  }
}

export function getClientCount(): number {
  return g.__aiox_wss?.clients.size ?? 0;
}
