import { fetchFromDexScreener, fetchFromJupiter } from '../clients/dexClients';
import { getCached, setCached } from './cache';
import { TokenNormalized } from '../types/token';

export type SortKey = 'volume' | 'price_change' | 'market_cap' | 'liquidity' | 'tx_count' | 'updated_at';
export type PeriodKey = '1h' | '24h' | '7d';
export interface FetchOptions {
  sort?: SortKey;
  order?: 'asc' | 'desc';
  period?: PeriodKey;
  limit?: number;
  cursor?: string;
}

export async function fetchAndMerge(query: string, ttl = 30, opts: FetchOptions = {}) {
  const cacheKey = `tokens:list:${query}`;
  const cached = await getCached<{ items: TokenNormalized[] }>(cacheKey);
  if (cached) {
    return paginateAndSort(cached.items, opts);
  }

  const [a, b] = await Promise.allSettled([
    fetchFromDexScreener(query),
    fetchFromJupiter(query)
  ]);

  const combined: TokenNormalized[] = [];

  if (a.status === 'fulfilled') combined.push(...a.value);
  if (b.status === 'fulfilled') combined.push(...b.value);

  const merged = mergeTokens(combined);
  const full = { items: merged };
  await setCached(cacheKey, full, ttl);
  return paginateAndSort(merged, opts);
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

    // Sum period volumes when available
    existing.volume_sol = (existing.volume_sol || 0) + (t.volume_sol || 0);
    existing.volume_1h = (existing.volume_1h || 0) + (t.volume_1h || 0);
    existing.volume_24h = (existing.volume_24h || 0) + (t.volume_24h || 0);
    existing.volume_7d = (existing.volume_7d || 0) + (t.volume_7d || 0);
    // Max liquidity, prefer higher USD liquidity snapshot
    existing.liquidity_usd = Math.max(existing.liquidity_usd || 0, t.liquidity_usd || 0);
    // Market cap: keep max to avoid double counting across pools
    existing.market_cap_usd = Math.max(existing.market_cap_usd || 0, t.market_cap_usd || 0);

    if ((t.updated_at || 0) > (existing.updated_at || 0)) {
      existing.price_sol = t.price_sol;
      existing.price_1hr_change = t.price_1hr_change ?? existing.price_1hr_change;
      existing.price_24h_change = t.price_24h_change ?? existing.price_24h_change;
      existing.price_7d_change = t.price_7d_change ?? existing.price_7d_change;
      existing.updated_at = t.updated_at;
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => (b.volume_24h || b.volume_sol || 0) - (a.volume_24h || a.volume_sol || 0)
  );
}

function paginateAndSort(items: TokenNormalized[], opts: FetchOptions) {
  const sortKey: SortKey = opts.sort || 'volume';
  const order = opts.order || 'desc';
  const limit = Math.max(1, Math.min(100, opts.limit ?? 20));

  const sorted = [...items].sort((a, b) => {
    const av = getSortValue(a, sortKey);
    const bv = getSortValue(b, sortKey);
    const cmp = av - bv;
    return order === 'asc' ? cmp : -cmp;
  });

  const decodeCursor = (c?: string) => {
    try {
      if (!c) return undefined;
      return JSON.parse(Buffer.from(c, 'base64').toString('utf8')) as { k: string; v: number };
    } catch {
      return undefined;
    }
  };
  const encodeCursor = (k: string, v: number) => Buffer.from(JSON.stringify({ k, v }), 'utf8').toString('base64');

  const cur = decodeCursor(opts.cursor);
  let startIdx = 0;
  if (cur) {
    const idx = sorted.findIndex((t) => tokenKey(t) === cur.k);
    startIdx = idx >= 0 ? idx + 1 : 0;
  }
  const page = sorted.slice(startIdx, startIdx + limit);
  const next = sorted[startIdx + limit];

  return {
    items: page,
    nextCursor: next ? encodeCursor(tokenKey(next), getSortValue(next, sortKey)) : undefined
  };
}

function tokenKey(t: TokenNormalized) {
  return `${t.chain}:${t.token_address}`.toLowerCase();
}

function getSortValue(t: TokenNormalized, key: SortKey): number {
  switch (key) {
    case 'volume':
      // Use period-aware volumes; fall back to 24h then legacy total
      return (
        t.volume_1h ?? t.volume_24h ?? t.volume_7d ?? t.volume_sol ?? 0
      );
    case 'price_change':
      return (
        t.price_1hr_change ?? t.price_24h_change ?? t.price_7d_change ?? 0
      );
    case 'market_cap':
      return t.market_cap_usd ?? 0;
    case 'liquidity':
      return t.liquidity_usd ?? 0;
    case 'tx_count':
      return t.transaction_count ?? 0;
    case 'updated_at':
      return t.updated_at ?? 0;
    default:
      return 0;
  }
}
