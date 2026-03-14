import { WebSocketServer, WebSocket } from 'ws';

export interface WsMessage {
  type: string;
  [key: string]: unknown;
}

let wss: WebSocketServer | null = null;

export function setBroadcaster(server: WebSocketServer): void {
  if (wss) return; // protect against double-init
  wss = server;
  // Ping loop — keeps connections alive and detects dead clients
  setInterval(() => {
    broadcast({ type: 'ping' });
  }, 30_000);
}

export function broadcast(message: WsMessage): void {
  if (!wss) return;
  const json = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  }
}

export function getClientCount(): number {
  return wss?.clients.size ?? 0;
}
