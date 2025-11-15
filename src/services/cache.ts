import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Same required options for stability with BullMQ
export const redis = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export async function getCached<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

export async function setCached(key: string, value: any, ttl = 30) {
  if (ttl && ttl > 0) {
    await redis.set(key, JSON.stringify(value), 'EX', ttl);
  } else {
    // skip caching when ttl <= 0
    return;
  }
}
