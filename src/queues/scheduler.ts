import { refreshQueue } from './refreshQueue';
import IORedis from 'ioredis';

export async function scheduleRefresh(query: string) {
  await refreshQueue.add(
    'refresh',
    { query },
    {
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true
    }
  );
}

// Listen for rate-limit notifications and enqueue with backoff dedup
export function startRateLimitBridge(redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379') {
  const sub = new IORedis(redisUrl);
  const ctrl = new IORedis(redisUrl);
  sub.subscribe('rate_limit:requests', (err) => { if (err) console.error('subscribe error', err); });
  sub.on('message', async (_ch, msg) => {
    try {
      const { provider, query } = JSON.parse(msg || '{}');
      if (!query) return;
      const key = `rl:backoff:${provider}:${query}`;
      const ok = await ctrl.setnx(key, '1');
      if (ok === 1) {
        await ctrl.expire(key, 10);
        await scheduleRefresh(query);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('rate-limit bridge error', e);
    }
  });
  return { sub, ctrl };
}
