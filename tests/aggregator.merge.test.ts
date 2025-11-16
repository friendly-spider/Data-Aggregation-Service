import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/services/cache', () => {
  const store = new Map<string, string>();
  return {
    redis: { publish: vi.fn() },
    getCached: vi.fn(async (k: string) => (store.has(k) ? JSON.parse(store.get(k)!) : null)),
    setCached: vi.fn(async (k: string, v: any, ttl?: number) => {
      if (ttl && ttl > 0) store.set(k, JSON.stringify(v));
    }),
  };
});

vi.mock('../src/clients/dexClients', () => ({
  fetchFromDexScreener: vi.fn(async (_q: string) => ([
    { source: 'dexscreener', chain: 'solana', token_address: 'A', token_name: 'Alpha', token_ticker: 'ALP', price_sol: 1, volume_24h: 10, liquidity_usd: 100, market_cap_usd: 1000, transaction_count: 5, price_24h_change: 1, updated_at: 2 },
    { source: 'dexscreener', chain: 'solana', token_address: 'B', token_name: 'Beta', token_ticker: 'BET', price_sol: 2, volume_24h: 20, liquidity_usd: 200, market_cap_usd: 2000, transaction_count: 10, price_24h_change: -1, updated_at: 2 },
  ])),
  fetchFromJupiter: vi.fn(async (_q: string) => ([
    { source: 'jupiter', chain: 'solana', token_address: 'A', token_name: 'Alpha', token_ticker: 'ALP', price_sol: 1.1, volume_24h: 5, liquidity_usd: 150, market_cap_usd: 1100, transaction_count: undefined, price_24h_change: 2, updated_at: 3 },
  ])),
}));

vi.mock('../src/clients/gecko', () => ({
  fetchFromCoinGecko: vi.fn(async (_q: string) => ([
    { source: 'coingecko', chain: 'coingecko', token_address: 'btc', token_name: 'Bitcoin', token_ticker: 'BTC', price_sol: 70000, volume_24h: 1000000, market_cap_usd: 100, updated_at: 1 },
  ])),
}));

import { fetchAndMerge } from '../src/services/aggregator';

describe('aggregator merge', () => {
  beforeEach(() => {
    // reset mocks is handled by vitest config
  });

  it('merges by chain:address, sums volume, keeps max liquidity/market cap, latest price', async () => {
    const res = await fetchAndMerge('sol', 30, { sort: 'volume' });
    const items = res.items;
    const a = items.find(t => t.token_address === 'A' && t.chain === 'solana')!;
    const b = items.find(t => t.token_address === 'B' && t.chain === 'solana')!;

    expect(a.volume_24h).toBe(15); // 10 + 5
    expect(a.liquidity_usd).toBe(150); // max(100,150)
    expect(a.market_cap_usd).toBe(1100); // max(1000,1100)
    expect(a.price_sol).toBe(1.1); // latest from updated_at=3
    expect(b.volume_24h).toBe(20);
  });
});
