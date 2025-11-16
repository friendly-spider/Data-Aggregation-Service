import { describe, it, expect, vi } from 'vitest';

const items = [
  { source: 'dex', chain: 'sol', token_address: 'X', market_cap_usd: 5, liquidity_usd: 50, updated_at: 2 },
  { source: 'dex', chain: 'sol', token_address: 'Y', market_cap_usd: 10, liquidity_usd: 40, updated_at: 3 },
  { source: 'dex', chain: 'sol', token_address: 'Z', market_cap_usd: 1, liquidity_usd: 60, updated_at: 1 },
];

vi.mock('../src/services/cache', () => ({
  redis: { publish: vi.fn() },
  getCached: vi.fn(async () => ({ items })),
  setCached: vi.fn(async () => {})
}));

import { fetchAndMerge } from '../src/services/aggregator';

describe('aggregator sorting keys', () => {
  it('sorts by market cap asc', async () => {
    const res = await fetchAndMerge('q', 30, { sort: 'market_cap', order: 'asc' });
    expect(res.items.map(i => i.token_address)).toEqual(['Z', 'X', 'Y']);
  });
  it('sorts by liquidity desc', async () => {
    const res = await fetchAndMerge('q', 30, { sort: 'liquidity', order: 'desc' });
    expect(res.items.map(i => i.token_address)).toEqual(['Z', 'X', 'Y']);
  });
});
