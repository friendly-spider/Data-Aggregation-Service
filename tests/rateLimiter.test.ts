import { describe, it, expect, vi } from 'vitest';

// Mock services/cache.redis.eval
const hoisted = vi.hoisted(() => ({
  evalSpy: vi.fn(async (..._args: any[]) => 1),
}));
vi.mock('../src/services/cache', () => ({ redis: { eval: hoisted.evalSpy } }));

import { tryAcquire } from '../src/lib/rateLimiter';

describe('rateLimiter.tryAcquire', () => {
  it('returns true when eval returns 1', async () => {
    hoisted.evalSpy.mockResolvedValueOnce(1);
    const ok = await tryAcquire('test', 10, 60);
    expect(ok).toBe(true);
  });
  it('returns false when eval returns 0', async () => {
    hoisted.evalSpy.mockResolvedValueOnce(0);
    const ok = await tryAcquire('test', 10, 60);
    expect(ok).toBe(false);
  });
});
