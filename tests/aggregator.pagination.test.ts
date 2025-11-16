import { describe, it, expect, vi } from 'vitest';

const items = Array.from({ length: 30 }).map((_, i) => ({
  source: 'dex', chain: 'solana', token_address: 'T' + i, token_name: 'T' + i,
  price_sol: i, volume_24h: i * 10, liquidity_usd: i, market_cap_usd: i,
  transaction_count: i, updated_at: i
}));

vi.mock('../src/services/cache', () => ({
  redis: { publish: vi.fn() },
  getCached: vi.fn(async (_k: string) => ({ items })),
  setCached: vi.fn(async () => {}),
}));

import { fetchAndMerge } from '../src/services/aggregator';

describe('aggregator pagination & sort', () => {
  it('sorts by volume desc and paginates with cursor', async () => {
    const first = await fetchAndMerge('sol', 30, { sort: 'volume', order: 'desc', limit: 5 });
    expect(first.items.length).toBe(5);
    const nextCur = first.nextCursor;
    expect(nextCur).toBeTruthy();

    const second = await fetchAndMerge('sol', 30, { sort: 'volume', order: 'desc', limit: 5, cursor: nextCur });
    expect(second.items.length).toBe(5);
    // ensure no overlap by addresses
    const ids1 = new Set(first.items.map(t => t.token_address));
    second.items.forEach(t => expect(ids1.has(t.token_address)).toBe(false));
  });
});
