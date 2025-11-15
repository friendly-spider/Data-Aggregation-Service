import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import WebSocket from 'ws';
import { fetchAndMerge, type FetchOptions } from './services/aggregator';
import { setupWsPubSub } from './services/ws-broadcaster';
import { redis } from './services/cache';
import { publishSnapshotForQuery } from './services/publisher';

const fastify = Fastify({ logger: false });

async function buildServer() {
  await fastify.register(cors, { origin: true });

  fastify.get('/health', async () => ({ status: 'ok' }));

  fastify.get('/api/tokens', async (request) => {
    const q = ((request.query as any).q as string) || 'sol';
    const opts: FetchOptions = {
      sort: (request.query as any).sort,
      order: (request.query as any).order,
      period: (request.query as any).period,
      limit: (request.query as any).limit ? Number((request.query as any).limit) : undefined,
      cursor: (request.query as any).cursor,
    };
    const data = await fetchAndMerge(q, 30, opts);
    return data;
  });

  fastify.post('/api/publish', async (request) => {
    const q = ((request.query as any).q as string) || 'sol';
    await publishSnapshotForQuery(q);
    return { ok: true };
  });

  const wss = new WebSocket.Server({
    server: fastify.server,   
    path: '/ws',
  });

  setupWsPubSub(wss, redis);

  const port = Number(process.env.PORT) || 3000;

  await fastify.listen({ port, host: '0.0.0.0' });

  console.log(`Server listening on http://localhost:${port}`);
}

buildServer().catch((err) => {
  console.error(err);
  process.exit(1);
});
