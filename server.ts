import { createServer } from 'node:http';
import next from 'next';
import { WebSocketServer } from 'ws';
import type { WebSocket as WsType } from 'ws';
import { setBroadcaster } from './src/server/ws-broadcaster';
import { startIdleDetector } from './src/server/idle-detector';
import { cleanupOldEvents, markStaleSessions } from './src/server/cleanup';
import { syncSystemTerminals, cleanupStaleTerminals } from './src/server/terminal-tracker';
import { getCompanyConfig } from './src/lib/queries';
import { startGangaEngine, stopGangaEngine } from './src/server/ganga/ganga-engine';
import { startJsonlWatcher } from './src/server/jsonl-watcher';
import { startAutopilotEngine, stopAutopilotEngine } from './src/server/autopilot-engine';
import { createPtyWebSocketServer } from './src/server/command-room/pty-websocket-server';
import { ProcessManager } from './src/server/command-room/process-manager';
import { db } from './src/lib/db';

// Process-level safety net — prevent crashes from unhandled errors
process.on('uncaughtException', (err) => {
  console.error('[server] uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandled rejection:', reason);
});

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT ?? 8888);

const app = next({ dev, hostname: 'localhost', port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (err) {
      console.error('[server] request error:', req.url, err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    }
  });

  const wss = new WebSocketServer({ noServer: true });
  const ptyWsServer = createPtyWebSocketServer();
  const ptyWss = ptyWsServer.getWss();

  wss.on('error', (err) => {
    console.error('[server] WebSocket server error:', err);
  });

  httpServer.on('upgrade', (req, socket, head) => {
    try {
      const parsed = new URL(req.url ?? '', `http://localhost:${port}`);
      const { pathname } = parsed;

      if (pathname === '/ws') {
        wss.handleUpgrade(req, socket as Parameters<typeof wss.handleUpgrade>[1], head, (ws: WsType) => {
          wss.emit('connection', ws, req);
        });
      } else if (pathname === '/pty') {
        const terminalId = parsed.searchParams.get('id');
        if (!terminalId) {
          socket.destroy();
          return;
        }
        ptyWss.handleUpgrade(req, socket as Parameters<typeof ptyWss.handleUpgrade>[1], head, (ws: WsType) => {
          ptyWsServer.handleConnection(ws, terminalId);
        });
      } else {
        socket.destroy();
      }
    } catch (err) {
      console.error('[server] upgrade error:', err);
      socket.destroy();
    }
  });

  httpServer.on('error', (err) => {
    console.error('[server] HTTP server error:', err);
  });

  setBroadcaster(wss);
  startIdleDetector();

  // WAL checkpoint: flush pending writes on startup and every 5 minutes
  try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); console.log('[server] WAL checkpoint completed on startup'); } catch { /* ignore */ }
  setInterval(() => {
    try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* ignore */ }
  }, 5 * 60 * 1000);

  // Terminal tracking: cleanup stale every 15s, sync system terminals every 30s
  setInterval(cleanupStaleTerminals, 15_000);
  setInterval(() => { syncSystemTerminals().catch(() => {}); }, 30_000);
  // Initial sync after 3s
  setTimeout(() => { syncSystemTerminals().catch(() => {}); }, 3_000);

  // JSONL transcript watcher — start after 5s to let terminals populate first
  setTimeout(() => { startJsonlWatcher().catch(() => {}); }, 5_000);

  // Cleanup old events — run after 60s delay, then every 24h
  setTimeout(() => {
    try {
      const config = getCompanyConfig();
      cleanupOldEvents(config.event_retention_days);
    } catch { /* silent on startup */ }

    setInterval(() => {
      try {
        const config = getCompanyConfig();
        cleanupOldEvents(config.event_retention_days);
      } catch { /* silent */ }
    }, 24 * 60 * 60 * 1000);
  }, 60_000);

  // Mark stale active sessions as interrupted — run after 90s, then every 15 min
  setTimeout(() => {
    try { markStaleSessions(); } catch { /* silent on startup */ }

    setInterval(() => {
      try { markStaleSessions(); } catch { /* silent */ }
    }, 15 * 60 * 1000);
  }, 90_000);

  // ─── Ganga Ativo: start/stop based on config ──────────────────────────────
  let gangaInterval: ReturnType<typeof setInterval> | null = null;

  function syncGangaState(): void {
    try {
      const config = getCompanyConfig();
      if (config.ganga_enabled && !gangaInterval) {
        gangaInterval = startGangaEngine();
      } else if (!config.ganga_enabled && gangaInterval) {
        stopGangaEngine(gangaInterval);
        gangaInterval = null;
      }
    } catch { /* silent on startup */ }
  }

  syncGangaState();
  // Re-check ganga state every 30s (picks up config changes)
  setInterval(syncGangaState, 30_000);

  // Autopilot operational loop is handled by OpenClaw cron, not by the local monitor.

  // ─── Graceful shutdown: kill all PTY processes on SIGTERM/SIGINT ──────────
  const gracefulShutdown = () => {
    console.log('[server] Shutting down — killing all PTY processes...');
    try { ptyWsServer.shutdown(); } catch { /* ignore */ }
    try { ProcessManager.getInstance().killAll(); } catch { /* ignore */ }
    process.exit(0);
  };
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
}).catch((err) => {
  console.error('[server] Failed to start Next.js:', err);
  process.exit(1);
});
