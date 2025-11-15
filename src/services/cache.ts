import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
export const redis = new IORedis(redisUrl);

export async function getCached<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

export async function setCached(key: string, value: any, ttl = 30) {
  if (ttl && ttl > 0) {
    await redis.set(key, JSON.stringify(value), 'EX', ttl);
  } else {
    // ttl <= 0 means skip caching
    return;
  }
}
