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
import { startWorker } from './queues/refreshQueue';
import { startRateLimitBridge } from './queues/scheduler';

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
  const autoTimer = setInterval(async () => {
    try {
      const actives = Array.from(getActiveQueries());
      for (const q of actives) {
        await publishSnapshotForQuery(q);
      }
    } catch (e) {
      console.error('auto-publish error', e);
    }
  }, intervalMs);

  // Optionally run BullMQ worker and rate-limit bridge in the same process
  const runWorker = String(process.env.RUN_WORKER || 'true').toLowerCase() !== 'false';
  const resources: { worker?: any; bridge?: { sub: any; ctrl: any } } = {};
  if (runWorker) {
    try {
      resources.worker = startWorker();
      resources.bridge = startRateLimitBridge();
      console.log('Worker and rate-limit bridge started in API process');
    } catch (e) {
      console.error('Failed to start embedded worker/bridge', e);
    }
  }

  async function shutdown() {
    try { clearInterval(autoTimer); } catch {}
    try { await fastify.close(); } catch {}
    try { if (resources.worker) await resources.worker.close(); } catch {}
    try { if (resources.bridge?.sub) await resources.bridge.sub.quit(); } catch {}
    try { if (resources.bridge?.ctrl) await resources.bridge.ctrl.quit(); } catch {}
    try { await redis.quit(); } catch {}
    process.exit(0);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(`Server listening on http://localhost:${port}`);
}

buildServer().catch((err) => {
  console.error(err);
  process.exit(1);
});
