import { redis } from './cache';
import { fetchAndMerge } from './aggregator';

export async function publishSnapshotForQuery(query: string) {
  const result = await fetchAndMerge(query, 0);
  const compact = result.items.map((t) => ({
    chain: t.chain,
    address: t.token_address,
    price_sol: t.price_sol,
    volume_sol: t.volume_sol
  }));
  await redis.publish('tokens:updates', JSON.stringify({ type: 'snapshot', query, data: compact }));
}
