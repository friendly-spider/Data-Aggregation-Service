import WebSocket from 'ws';
import type { IncomingMessage } from 'http';
import type { Redis } from 'ioredis';

const filters = new WeakMap<WebSocket, { q?: string; period?: string }>();
const activeQueries = new Set<string>();

export function getActiveQueries(): Set<string> {
  // Return a copy to avoid external mutation
  return new Set(activeQueries);
}

export function setupWsPubSub(wss: WebSocket.Server, redisClient: Redis) {
  const sub = redisClient.duplicate();
  sub.subscribe('tokens:updates', (err?: Error | null) => {
    if (err) console.error(err);
  });

  function recomputeActive() {
    activeQueries.clear();
    for (const client of wss.clients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      const f = filters.get(client) || {};
      if (f.q) activeQueries.add(f.q);
    }
  }

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
      recomputeActive();
    } catch { /* ignore */ }
    ws.on('message', (m: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(String(m));
        if (msg && msg.type === 'setFilter') {
          const current = filters.get(ws) || {};
          const next = {
            q: typeof msg.q === 'string' && msg.q.length ? String(msg.q).toLowerCase() : undefined,
            period: typeof msg.period === 'string' && msg.period.length ? String(msg.period).toLowerCase() : undefined,
          };
          filters.set(ws, { ...current, ...next });
          recomputeActive();
        }
      } catch {
        // ignore malformed messages
      }
    });
    ws.on('close', () => {
      filters.delete(ws);
      recomputeActive();
    });
  });
}
