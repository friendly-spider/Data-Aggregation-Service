import { describe, it, expect, vi } from 'vitest';

const store = new Map<string, string>();
const hoisted = vi.hoisted(() => ({
  publishSpy: vi.fn(async (..._args: any[]) => 1),
}));
vi.mock('../src/services/cache', () => ({
  redis: {
    get: vi.fn(async (k: string) => store.get(k) || null),
    set: vi.fn(async (k: string, v: string) => { store.set(k, v); return 'OK'; }),
    publish: hoisted.publishSpy,
  },
}));

vi.mock('../src/services/aggregator', () => ({
  fetchAndMerge: vi.fn(async (_q: string) => ({ items: [
    { chain: 'solana', token_address: 'A', price_sol: 10, volume_sol: 100, updated_at: Date.now() },
  ] }))
}));

import { publishSnapshotForQuery } from '../src/services/publisher';

describe('publisher deltas', () => {
  it('does not publish delta on first run (no previous state)', async () => {
    store.clear();
    hoisted.publishSpy.mockClear();
    await publishSnapshotForQuery('sol');
    const deltaMsgs = hoisted.publishSpy.mock.calls.filter((c: any[]) => JSON.parse(c[1]).type === 'delta');
    expect(deltaMsgs.length).toBe(0);
  });

  it('publishes delta when price or volume change exceeds threshold', async () => {
    store.clear();
    hoisted.publishSpy.mockClear();

    // First run sets baseline
    await publishSnapshotForQuery('sol');

    // Mock change: aggregator returns larger values now
    const agg = await import('../src/services/aggregator');
    (agg.fetchAndMerge as any).mockResolvedValueOnce({ items: [
      { chain: 'solana', token_address: 'A', price_sol: 11, volume_sol: 120, updated_at: Date.now() },
    ] });

    await publishSnapshotForQuery('sol');
    const deltaMsgs = hoisted.publishSpy.mock.calls.filter((c: any[]) => JSON.parse(c[1]).type === 'delta');
    expect(deltaMsgs.length).toBe(1);
  });
});
