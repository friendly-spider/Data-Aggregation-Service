import WebSocket from 'ws';
import type { IncomingMessage } from 'http';
import type { Redis } from 'ioredis';

const filters = new WeakMap<WebSocket, { q?: string; period?: string }>();

export function setupWsPubSub(wss: WebSocket.Server, redisClient: Redis) {
  const sub = redisClient.duplicate();
  sub.subscribe('tokens:updates', (err?: Error | null) => {
    if (err) console.error(err);
  });

  sub.on('message', (_channel: string, message: string) => {
    let payload: any = undefined;
    try { payload = JSON.parse(message); } catch { payload = undefined; }
    for (const client of wss.clients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      const f = filters.get(client) || {};
      if (payload && payload.query && f.q && String(payload.query).toLowerCase() !== f.q) {
        continue;
      }
      try { client.send(message); } catch { /* ignore */ }
    }
  });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      const q = url.searchParams.get('q')?.toLowerCase();
      const period = url.searchParams.get('period')?.toLowerCase();
      filters.set(ws, { q: q || undefined, period: period || undefined });
    } catch { /* ignore */ }
    ws.on('message', (_m: WebSocket.RawData) => {
      // Hook for subscribe/unsubscribe commands later
    });
  });
}
