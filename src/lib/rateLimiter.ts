import { redis } from '../services/cache';

// Distributed token-bucket via Redis EVAL
export async function tryAcquire(providerKey: string, capacity = 100, refillIntervalSec = 60) {
  const now = Date.now();
  const key = `rl:${providerKey}`;
  const lua = `
    local key = KEYS[1]
    local cap = tonumber(ARGV[1])
    local refill = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])
    local rate = tonumber(ARGV[4])
    local data = redis.call("HMGET", key, "tokens", "last")
    local tokens = tonumber(data[1]) or cap
    local last = tonumber(data[2]) or 0
    local elapsed = math.max(0, now - last)
    local refillTokens = math.floor(elapsed / refill)
    tokens = math.min(cap, tokens + refillTokens)
    if tokens <= 0 then
      redis.call("HMSET", key, "tokens", tokens, "last", now)
      return 0
    else
      tokens = tokens - 1
      redis.call("HMSET", key, "tokens", tokens, "last", now)
      redis.call("EXPIRE", key, 3600)
      return 1
    end
  `;
  const res = await (redis as any).eval(lua, 1, key, capacity, refillIntervalSec * 1000, now, 0);
  return res === 1 || res === '1';
}
