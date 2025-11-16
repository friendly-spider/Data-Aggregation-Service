import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';
import WebSocket from 'ws';
import { fetchAndMerge, type FetchOptions } from './services/aggregator';
import { setupWsPubSub, getActiveQueries } from './services/ws-broadcaster';
import { redis } from './services/cache';
import { publishSnapshotForQuery } from './services/publisher';

const fastify = Fastify({ logger: false });

async function buildServer() {
  await fastify.register(cors, { origin: true });
  await fastify.register(fastifyStatic, {
    root: path.join(__dirname, '../public'),
    prefix: '/',
    index: 'index.html'
  });

  // Explicit route for index to avoid any prefix ambiguity
  fastify.get('/', async (_req, reply) => {
    // @ts-ignore - sendFile is added by @fastify/static
    return reply.type('text/html').sendFile('index.html');
  });

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

  // Manual WS trigger endpoint (for testing/dev)
  fastify.post('/api/trigger', async (request) => {
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

  // Periodically publish updates for active queries seen on WS connections
  const intervalMs = Number(process.env.PUBLISH_INTERVAL_MS || 15000);
  setInterval(async () => {
    try {
      const actives = Array.from(getActiveQueries());
      for (const q of actives) {
        await publishSnapshotForQuery(q);
      }
    } catch (e) {
      console.error('auto-publish error', e);
    }
  }, intervalMs);

  console.log(`Server listening on http://localhost:${port}`);
}

buildServer().catch((err) => {
  console.error(err);
  process.exit(1);
});
