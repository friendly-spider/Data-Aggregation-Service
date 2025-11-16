import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/http', () => ({ http: { get: vi.fn((_u: string) => ({ json: async () => ([{
  id: 'abc', name: 'Token', symbol: 'TKN', usdPrice: 1.23, liquidity: 456,
  stats24h: { buyVolume: 10, sellVolume: 5, priceChangePercent: 2.5 }
}]) })) } }));
vi.mock('../src/lib/rateLimiter', () => ({ tryAcquire: vi.fn(async () => true) }));
vi.mock('../src/services/cache', () => ({ redis: { publish: vi.fn() } }));

import { fetchFromJupiter } from '../src/clients/dexClients';

describe('jupiter mapping', () => {
  it('maps fields to TokenNormalized', async () => {
    const res = await fetchFromJupiter('anything');
    expect(res.length).toBe(1);
    const t = res[0];
    expect(t.token_address).toBe('abc');
    expect(t.token_name).toBe('Token');
    expect(t.token_ticker).toBe('TKN');
    expect(t.price_sol).toBe(1.23);
    expect(t.liquidity_usd).toBe(456);
    expect(t.volume_24h).toBe(15);
    expect(t.price_24h_change).toBe(2.5);
  });
});
