import { WebSocketServer, WebSocket } from 'ws';
import { ProcessManager } from './process-manager';
import { ChatMessageStore } from './chat-store';
import { ChatCollector } from './chat-collector';
import type { ProcessEvent } from './types';
import type { ChatEvent } from './chat-types';

// ─── PtyWebSocketServer ─────────────────────────────────────────────────────
// Bridge between browser WebSocket clients and node-pty processes.
//
// Protocol:
//   Server → Client:
//     - Binary frame: stdout data (raw PTY output)
//     - JSON text: {"type":"scrollback","data":"..."} on connect
//     - JSON text: {"type":"status","status":"..."} on connect + changes
//     - JSON text: {"type":"exit","code":N,"signal":"..."} on process exit
//     - JSON text: {"type":"error","message":"..."} on errors
//     - JSON text: {"type":"pong"} in response to ping
//   Client → Server:
//     - Binary frame: stdin data → written to PTY
//     - JSON text: {"type":"resize","cols":N,"rows":N} → resize PTY
//     - JSON text: {"type":"ping"} → responds with pong

const PING_INTERVAL_MS = 30_000;

export class PtyWebSocketServer {
  private wss: WebSocketServer;
  private clients = new Map<string, Set<WebSocket>>();
  private pm: ProcessManager;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.wss = new WebSocketServer({ noServer: true });
    this.pm = ProcessManager.getInstance();

    // Initialize ChatCollector (starts listening to ProcessManager events)
    ChatCollector.getInstance();

    // Listen for ProcessManager events and broadcast to clients
    this.pm.on('process-event', (event: ProcessEvent) => {
      this.handleProcessEvent(event);
    });

    // Listen for ChatStore events and broadcast chat messages to clients
    const chatStore = ChatMessageStore.getInstance();
    chatStore.on('chat-event', (event: ChatEvent) => {
      this.handleChatEvent(event);
    });

    // Ping keep-alive
    this.pingInterval = setInterval(() => {
      Array.from(this.wss.clients).forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      });
    }, PING_INTERVAL_MS);

    this.wss.on('error', (err) => {
      console.error('[PtyWS] server error:', err);
    });
  }

  /** Returns the underlying WebSocketServer for upgrade handling */
  getWss(): WebSocketServer {
    return this.wss;
  }

  /** Handle a new WebSocket connection for a specific terminal */
  handleConnection(ws: WebSocket, terminalId: string): void {
    const proc = this.pm.get(terminalId);
    if (!proc) {
      this.sendJson(ws, { type: 'error', message: `Terminal not found: ${terminalId}` });
      ws.close(4004, 'Terminal not found');
      return;
    }

    // Register client in broadcast set
    let clientSet = this.clients.get(terminalId);
    if (!clientSet) {
      clientSet = new Set();
      this.clients.set(terminalId, clientSet);
    }
    clientSet.add(ws);

    // AC3: Send scrollback buffer on connect
    const scrollbackData = proc.scrollback.join('');
    if (scrollbackData.length > 0) {
      this.sendJson(ws, { type: 'scrollback', data: scrollbackData });
    }

    // AC4: Send current status on connect
    this.sendJson(ws, { type: 'status', status: proc.status });

    // ─── Message handler ──────────────────────────────────────────────
    ws.on('message', (rawData: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      if (isBinary) {
        // AC6: Binary frame → stdin
        const data = Buffer.isBuffer(rawData)
          ? rawData.toString('utf-8')
          : Buffer.from(rawData as ArrayBuffer).toString('utf-8');
        this.pm.write(terminalId, data);
        return;
      }

      // Text frame → JSON command
      try {
        const msg = JSON.parse(rawData.toString());
        this.handleClientMessage(terminalId, msg);
      } catch {
        this.sendJson(ws, { type: 'error', message: 'Invalid JSON' });
      }
    });

    // ─── Close handler ────────────────────────────────────────────────
    ws.on('close', () => {
      // AC11: Remove client; do NOT kill the process
      const set = this.clients.get(terminalId);
      if (set) {
        set.delete(ws);
        // AC4.3: Clean up empty set
        if (set.size === 0) {
          this.clients.delete(terminalId);
        }
      }
    });

    ws.on('error', (err) => {
      console.error(`[PtyWS] client error (terminal=${terminalId}):`, err.message);
    });
  }

  /** Process a JSON text message from a client */
  private handleClientMessage(terminalId: string, msg: Record<string, unknown>): void {
    switch (msg.type) {
      case 'resize':
        // AC7: Resize PTY
        if (typeof msg.cols === 'number' && typeof msg.rows === 'number') {
          this.pm.resize(terminalId, msg.cols, msg.rows);
        }
        break;

      case 'ping':
        // AC12: Respond with pong
        this.broadcastToTerminal(terminalId, JSON.stringify({ type: 'pong' }), false);
        break;

      case 'status': {
        // Client requests current status
        const proc = this.pm.get(terminalId);
        if (proc) {
          this.broadcastToTerminal(
            terminalId,
            JSON.stringify({ type: 'status', status: proc.status }),
            false,
          );
        }
        break;
      }

      default:
        break;
    }
  }

  /** Handle ChatStore events and broadcast chat messages to clients */
  private handleChatEvent(event: ChatEvent): void {
    if (event.type === 'chat-message') {
      this.broadcastToTerminal(
        event.terminalId,
        JSON.stringify({
          type: 'chat-message',
          message: event.message,
        }),
        false,
      );
    } else if (event.type === 'chat-clear') {
      this.broadcastToTerminal(
        event.terminalId,
        JSON.stringify({ type: 'chat-clear' }),
        false,
      );
    }
  }

  /** Handle ProcessManager events and broadcast to relevant clients */
  private handleProcessEvent(event: ProcessEvent): void {
    switch (event.type) {
      case 'data':
        // AC5: stdout as binary frame
        if (event.data) {
          this.broadcastToTerminal(event.id, Buffer.from(event.data, 'utf-8'), true);
        }
        break;

      case 'status':
        // Status change
        if (event.status) {
          this.broadcastToTerminal(
            event.id,
            JSON.stringify({ type: 'status', status: event.status }),
            false,
          );
        }
        break;

      case 'exit':
        // AC8: Process terminated
        this.broadcastToTerminal(
          event.id,
          JSON.stringify({
            type: 'exit',
            code: event.exitCode ?? -1,
            signal: event.signal,
          }),
          false,
        );
        break;
    }
  }

  /** Send data to all clients connected to a terminal */
  private broadcastToTerminal(
    terminalId: string,
    data: string | Buffer,
    isBinary: boolean,
  ): void {
    const set = this.clients.get(terminalId);
    if (!set) return;
    Array.from(set).forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(data, { binary: isBinary });
        } catch {
          // Client may have disconnected
        }
      }
    });
  }

  /** Send a JSON message to a single client */
  private sendJson(ws: WebSocket, obj: Record<string, unknown>): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(obj));
      } catch {
        // ignore
      }
    }
  }

  /** Shutdown: close all connections, stop ping interval */
  shutdown(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    Array.from(this.wss.clients).forEach((ws) => {
      try { ws.close(1001, 'Server shutting down'); } catch { /* ignore */ }
    });
    this.clients.clear();
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

let instance: PtyWebSocketServer | null = null;

export function createPtyWebSocketServer(): PtyWebSocketServer {
  if (!instance) {
    instance = new PtyWebSocketServer();
  }
  return instance;
}
