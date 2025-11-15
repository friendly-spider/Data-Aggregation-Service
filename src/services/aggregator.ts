import { fetchFromDexScreener, fetchFromJupiter } from '../clients/dexClients';
import { getCached, setCached } from './cache';
import { TokenNormalized } from '../types/token';

export async function fetchAndMerge(query: string, ttl = 30) {
  const cacheKey = `tokens:list:${query}`;
  const cached = await getCached<{ items: TokenNormalized[] }>(cacheKey);
  if (cached) return cached;

  const [a, b] = await Promise.allSettled([
    fetchFromDexScreener(query),
    fetchFromJupiter(query)
  ]);

  const combined: TokenNormalized[] = [];

  if (a.status === 'fulfilled') combined.push(...a.value);
  if (b.status === 'fulfilled') combined.push(...b.value);

  const merged = mergeTokens(combined);

  const result = { items: merged.slice(0, 50) };

  await setCached(cacheKey, result, ttl);
  return result;
}

function mergeTokens(list: TokenNormalized[]): TokenNormalized[] {
  const map = new Map<string, TokenNormalized>();

  for (const t of list) {
    const key = `${t.chain}:${t.token_address}`.toLowerCase();

    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...t });
      continue;
    }

    existing.volume_sol = (existing.volume_sol || 0) + (t.volume_sol || 0);
    existing.liquidity_sol = Math.max(existing.liquidity_sol || 0, t.liquidity_sol || 0);

    if ((t.updated_at || 0) > (existing.updated_at || 0)) {
      existing.price_sol = t.price_sol;
      existing.updated_at = t.updated_at;
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => (b.volume_sol || 0) - (a.volume_sol || 0)
  );
}
