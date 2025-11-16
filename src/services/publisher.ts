import { redis } from './cache';
import { fetchAndMerge } from './aggregator';

const DELTA_PRICE_THRESHOLD = 0.005; // 0.5%
const DELTA_VOLUME_THRESHOLD = 0.01; // 1% absolute relative change

export async function publishSnapshotForQuery(query: string) {
  const result = await fetchAndMerge(query, 0);
  const compact = result.items.map((t) => ({
    chain: t.chain,
    address: t.token_address,
    price_sol: t.price_sol || 0,
    volume_sol: t.volume_sol || 0,
    updated_at: t.updated_at || Date.now()
  }));

  // Publish full snapshot
  await redis.publish('tokens:updates', JSON.stringify({ type: 'snapshot', query, data: compact }));

  // Compute and publish per-token deltas
  for (const tok of compact) {
    const lastKey = `tokens:last:${tok.chain}:${tok.address}`;
    const lastRaw = await redis.get(lastKey);
    const now = tok.updated_at;
    let shouldPublish = false;
    if (lastRaw) {
      try {
        const prev = JSON.parse(lastRaw) as { price_sol: number; volume_sol: number; updated_at: number };
        const pricePrev = prev.price_sol || 0;
        const volPrev = prev.volume_sol || 0;
        const priceCur = tok.price_sol || 0;
        const volCur = tok.volume_sol || 0;
        const priceRel = pricePrev ? Math.abs(priceCur - pricePrev) / Math.max(1e-12, Math.abs(pricePrev)) : 1;
        const volRel = volPrev ? Math.abs(volCur - volPrev) / Math.max(1e-12, Math.abs(volPrev)) : 1;
        if (priceRel >= DELTA_PRICE_THRESHOLD || volRel >= DELTA_VOLUME_THRESHOLD) {
          shouldPublish = true;
        }
      } catch {
        shouldPublish = true;
      }
    } else {
      // No previous state; do not publish delta to prevent initial spam
      shouldPublish = false;
    }

    await redis.set(lastKey, JSON.stringify(tok), 'EX', 3600);
    if (shouldPublish) {
      await redis.publish('tokens:updates', JSON.stringify({ type: 'delta', query, data: tok }));
    }
  }
}
