import { createServer } from 'node:http';
import { parse } from 'node:url';
import next from 'next';
import { WebSocketServer } from 'ws';
import type { WebSocket as WsType } from 'ws';
import { setBroadcaster } from './src/server/ws-broadcaster';

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT ?? 8888);

const app = next({ dev, hostname: 'localhost', port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
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

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
