import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getMock: vi.fn(),
}));
vi.mock('../src/lib/http', () => ({ http: { get: hoisted.getMock } }));
vi.mock('../src/lib/rateLimiter', () => ({ tryAcquire: vi.fn(async () => true) }));
vi.mock('../src/services/cache', () => ({ redis: { publish: vi.fn() } }));

import { fetchFromCoinGecko } from '../src/clients/gecko';

describe('coingecko headers', () => {
  beforeEach(() => {
    hoisted.getMock.mockReset();
    process.env.COINGECKO_API_KEY = 'test-key';
  });

  it('sends x-cg-demo-api-key header on both requests', async () => {
    // First call: search
    hoisted.getMock.mockImplementationOnce((_url: string, opts?: any) => ({ json: async () => ({ coins: [{ id: 'bitcoin' }] }) }));
    // Second call: markets
    hoisted.getMock.mockImplementationOnce((_url: string, opts?: any) => ({ json: async () => ([{ id: 'bitcoin', current_price: 1 }]) }));

    const res = await fetchFromCoinGecko('btc');
    expect(res.length).toBeGreaterThan(0);
    // Validate headers for both requests
    const calls = hoisted.getMock.mock.calls;
    expect(calls.length).toBe(2);
    calls.forEach(([, opts]) => {
      expect(opts?.headers?.['x-cg-demo-api-key']).toBe('test-key');
    });
  });
});
