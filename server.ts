import { createServer } from 'node:http';
import next from 'next';
import { WebSocketServer } from 'ws';
import type { WebSocket as WsType } from 'ws';
import { setBroadcaster } from './src/server/ws-broadcaster';
import { startIdleDetector } from './src/server/idle-detector';
import { cleanupOldEvents } from './src/server/cleanup';
import { syncSystemTerminals, cleanupStaleTerminals } from './src/server/terminal-tracker';
import { getCompanyConfig } from './src/lib/queries';

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

  wss.on('error', (err) => {
    console.error('[server] WebSocket server error:', err);
  });

  httpServer.on('upgrade', (req, socket, head) => {
    try {
      const { pathname } = new URL(req.url ?? '', `http://localhost:${port}`);
      if (pathname === '/ws') {
        wss.handleUpgrade(req, socket as Parameters<typeof wss.handleUpgrade>[1], head, (ws: WsType) => {
          wss.emit('connection', ws, req);
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

  // Terminal tracking: cleanup stale every 15s, sync system terminals every 30s
  setInterval(cleanupStaleTerminals, 15_000);
  setInterval(() => { syncSystemTerminals().catch(() => {}); }, 30_000);
  // Initial sync after 3s
  setTimeout(() => { syncSystemTerminals().catch(() => {}); }, 3_000);

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

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
}).catch((err) => {
  console.error('[server] Failed to start Next.js:', err);
  process.exit(1);
});
