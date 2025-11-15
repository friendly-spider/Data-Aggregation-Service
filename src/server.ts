import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import WebSocket from 'ws';
import { fetchAndMerge } from './services/aggregator';
import { setupWsPubSub } from './services/ws-broadcaster';
import { redis } from './services/cache';
import { publishSnapshotForQuery } from './services/publisher';

const fastify = Fastify({ logger: false });

async function buildServer() {
  await fastify.register(cors, { origin: true });

  fastify.get('/health', async () => ({ status: 'ok' }));

  fastify.get('/api/tokens', async (request) => {
    const q = ((request.query as any).q as string) || 'sol';
    const data = await fetchAndMerge(q, 30);
    return data;
  });

  fastify.post('/api/publish', async (request) => {
    const q = ((request.query as any).q as string) || 'sol';
    await publishSnapshotForQuery(q);
    return { ok: true };
  });

  // ---- FIX: attach WebSocket server to fastify.server directly ----
  const wss = new WebSocket.Server({
    server: fastify.server,   // IMPORTANT
    path: '/ws',
  });

  setupWsPubSub(wss, redis);

  const port = Number(process.env.PORT) || 3000;

  // ---- FIX: Use fastify.listen() instead of server.listen() ----
  await fastify.listen({ port, host: '0.0.0.0' });

  console.log(`Server listening on http://localhost:${port}`);
}

buildServer().catch((err) => {
  console.error(err);
  process.exit(1);
});
