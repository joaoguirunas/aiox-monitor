import { createServer } from 'node:http';
import { parse } from 'node:url';
import next from 'next';
import { WebSocketServer } from 'ws';
import type { WebSocket as WsType } from 'ws';
import { setBroadcaster } from './src/server/ws-broadcaster';
import { startIdleDetector } from './src/server/idle-detector';
import { cleanupOldEvents } from './src/server/cleanup';
import { getCompanyConfig } from './src/lib/queries';

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT ?? 8888);

const app = next({ dev, hostname: 'localhost', port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('[server] request error:', req.url, err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    }
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url ?? '');
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket as Parameters<typeof wss.handleUpgrade>[1], head, (ws: WsType) => {
        wss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  setBroadcaster(wss);
  startIdleDetector();

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
});
