import WebSocket from 'ws';
import type { Redis } from 'ioredis';

export function setupWsPubSub(wss: WebSocket.Server, redisClient: Redis) {
  const sub = redisClient.duplicate();
  sub.subscribe('tokens:updates', (err?: Error | null) => {
    if (err) console.error(err);
  });

  sub.on('message', (_channel: string, message: string) => {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (_) {
          // ignore send errors
        }
      }
    }
  });

  wss.on('connection', (ws: WebSocket) => {
    ws.on('message', (_m: WebSocket.RawData) => {
      // Hook for future subscribe/unsubscribe messages from clients
    });
  });
}
