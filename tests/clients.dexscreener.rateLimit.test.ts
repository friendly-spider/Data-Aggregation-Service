import { describe, it, expect, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  publishSpy: vi.fn(async (..._args: any[]) => 0),
}));

vi.mock('../src/lib/rateLimiter', () => ({ tryAcquire: vi.fn(async () => false) }));
vi.mock('../src/services/cache', () => ({ redis: { publish: hoisted.publishSpy } }));

import { fetchFromDexScreener } from '../src/clients/dexClients';

describe('dexscreener rate limit behavior', () => {
  it('publishes rate_limit:requests and returns [] when limited', async () => {
    const res = await fetchFromDexScreener('sol');
    expect(res).toEqual([]);
    expect(hoisted.publishSpy).toHaveBeenCalledWith('rate_limit:requests', expect.stringContaining('dexscreener'));
  });
});
