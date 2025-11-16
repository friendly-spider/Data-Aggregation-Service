import { fetchFromDexScreener, fetchFromJupiter } from '../clients/dexClients';
import { fetchFromCoinGecko } from '../clients/gecko';
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

  const [a, b, c] = await Promise.allSettled([
    fetchFromDexScreener(query),
    fetchFromJupiter(query),
    fetchFromCoinGecko(query)
  ]);

  const combined: TokenNormalized[] = [];

  if (a.status === 'fulfilled') combined.push(...a.value);
  if (b.status === 'fulfilled') combined.push(...b.value);
  if (c.status === 'fulfilled') combined.push(...c.value);

  const merged = mergeTokensCanonical(combined);
  const full = { items: merged };
  await setCached(cacheKey, full, ttl);
  return paginateAndSort(merged, opts);
}

function mergeTokensCanonical(list: TokenNormalized[]): TokenNormalized[] {
  type Cluster = {
    id: string;
    keyType: 'address' | 'symbol';
    rep: TokenNormalized; // representative for similarity checks
    addrs: Set<string>;
    items: TokenNormalized[];
    agg: TokenNormalized; // aggregated result being built
  };

  const addressMap = new Map<string, Cluster>();
  const symbolBuckets = new Map<string, Cluster[]>();
  let symbolCounters = new Map<string, number>();

  const addrKey = (t: TokenNormalized) => `${t.chain}:${t.token_address}`.toLowerCase();
  const upperTicker = (t: TokenNormalized) => (t.token_ticker || '').toUpperCase();

  for (const t of list) {
    const akey = addrKey(t);
    const sym = upperTicker(t);

    // 1) Exact address-based merge takes precedence
    const existingByAddr = addressMap.get(akey);
    if (existingByAddr) {
      mergeInto(existingByAddr, t);
      continue;
    }

    // 2) Try to merge by canonical symbol with heuristics
    let placed = false;
    if (sym) {
      const clusters = symbolBuckets.get(sym) || [];
      for (const cl of clusters) {
        if (isSimilar(cl.rep, t)) {
          mergeInto(cl, t);
          placed = true;
          break;
        }
      }
      if (!placed) {
        // create a new ADDRESS-based cluster, but register under symbol bucket
        const id = addrKey(t);
        const cl: Cluster = createCluster(id, 'address', t);
        addCluster(cl);
        placed = true;
      }
      continue;
    }

    // 3) No symbol; fallback to address-based
    const cl = createCluster(akey, 'address', t);
    addCluster(cl);
  }

  function addCluster(cl: Cluster) {
    // Register by address keys inside cluster
    for (const it of cl.items) {
      addressMap.set(addrKey(it), cl);
    }
    // Register in symbol bucket if ticker exists
    const sym = upperTicker(cl.rep);
    if (sym) {
      const arr = symbolBuckets.get(sym) || [];
      arr.push(cl);
      symbolBuckets.set(sym, arr);
    }
  }

  function createCluster(id: string, keyType: 'address' | 'symbol', t: TokenNormalized): Cluster {
    const agg = cloneTokenForAgg(t);
    const cl: Cluster = { id, keyType, rep: t, addrs: new Set([addrKey(t)]), items: [t], agg };
    return cl;
  }

  function mergeInto(cl: Cluster, t: TokenNormalized) {
    cl.items.push(t);
    cl.addrs.add(addrKey(t));
    // Update rep if newer updated_at for better similarity baseline
    if ((t.updated_at || 0) > (cl.rep.updated_at || 0)) cl.rep = t;
    // Aggregate metrics
    accumulate(cl.agg, t);
  }

  function cloneTokenForAgg(t: TokenNormalized): TokenNormalized {
    const copy: TokenNormalized = { ...t };
    // Initialize normalized metrics
    copy.norm_volume_24h = (t.volume_24h ?? t.volume_sol ?? 0) || 0;
    copy.liquidity_dex = isDex(t) ? (t.liquidity_usd ?? 0) : undefined;
    copy.market_cap_cg = isCG(t) ? (t.market_cap_usd ?? 0) : undefined;
    copy.market_cap_dex = isDex(t) ? (t.market_cap_usd ?? 0) : undefined;
    return copy;
  }

  function accumulate(dst: TokenNormalized, src: TokenNormalized) {
    // Period volumes
    dst.volume_sol = (dst.volume_sol || 0) + (src.volume_sol || 0);
    dst.volume_1h = (dst.volume_1h || 0) + (src.volume_1h || 0);
    dst.volume_24h = (dst.volume_24h || 0) + (src.volume_24h || 0);
    dst.volume_7d = (dst.volume_7d || 0) + (src.volume_7d || 0);
    // Normalized volume: sum 24h (fallback to legacy total)
    dst.norm_volume_24h = (dst.norm_volume_24h || 0) + (src.volume_24h ?? src.volume_sol ?? 0);
    // Liquidity
    dst.liquidity_usd = Math.max(dst.liquidity_usd || 0, src.liquidity_usd || 0);
    if (isDex(src)) dst.liquidity_dex = Math.max(dst.liquidity_dex || 0, src.liquidity_usd || 0);
    // Market cap
    dst.market_cap_usd = Math.max(dst.market_cap_usd || 0, src.market_cap_usd || 0);
    if (isCG(src)) dst.market_cap_cg = Math.max(dst.market_cap_cg || 0, src.market_cap_usd || 0);
    if (isDex(src)) dst.market_cap_dex = Math.max(dst.market_cap_dex || 0, src.market_cap_usd || 0);
    // Latest price by timestamp
    if ((src.updated_at || 0) > (dst.updated_at || 0)) {
      dst.price_sol = src.price_sol;
      dst.price_1hr_change = src.price_1hr_change ?? dst.price_1hr_change;
      dst.price_24h_change = src.price_24h_change ?? dst.price_24h_change;
      dst.price_7d_change = src.price_7d_change ?? dst.price_7d_change;
      dst.token_name = src.token_name ?? dst.token_name;
      dst.token_ticker = src.token_ticker ?? dst.token_ticker;
      dst.updated_at = src.updated_at;
      dst.source = src.source ?? dst.source;
    }
  }

  function isDex(t: TokenNormalized) {
    const s = (t.source || '').toLowerCase();
    return s === 'dexscreener' || s === 'jupiter';
  }
  function isCG(t: TokenNormalized) {
    const s = (t.source || '').toLowerCase();
    return s === 'coingecko';
  }

  // Name similarity using normalized Levenshtein ratio
  function isSimilar(a: TokenNormalized, b: TokenNormalized): boolean {
    const tickerA = (a.token_ticker || '').toUpperCase();
    const tickerB = (b.token_ticker || '').toUpperCase();
    if (!tickerA || !tickerB || tickerA !== tickerB) return false;
    const nameA = (a.token_name || '').toLowerCase();
    const nameB = (b.token_name || '').toLowerCase();
    if (!nameA || !nameB) return false;
    const sim = similarity(nameA, nameB);
    if (sim < 0.7) return false;
    const pA = a.price_sol;
    const pB = b.price_sol;
    if (pA == null || pB == null) return false;
    return withinPct(pA, pB, 0.10);
  }

  function similarity(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length) || 1;
    const dist = levenshtein(a, b);
    return (maxLen - dist) / maxLen;
  }

  function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp = new Array(n + 1).fill(0);
    for (let j = 0; j <= n; j++) dp[j] = j;
    for (let i = 1; i <= m; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= n; j++) {
        const tmp = dp[j];
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[j] = Math.min(
          dp[j] + 1,
          dp[j - 1] + 1,
          prev + cost,
        );
        prev = tmp;
      }
    }
    return dp[n];
  }

  function withinPct(a: number, b: number, pct: number) {
    const diff = Math.abs(a - b);
    const base = Math.max(1e-12, Math.abs(a));
    return diff / base <= pct;
  }

  // Finalize clusters into tokens
  const out: TokenNormalized[] = [];
  for (const cl of new Set(addressMap.values())) {
    const t = cl.agg;
    // Identity: if multiple distinct addresses present, use symbol identity
    if (cl.keyType === 'symbol' || cl.addrs.size > 1) {
      const sym = (t.token_ticker || '').toUpperCase() || 'UNKNOWN';
      t.chain = 'symbol';
      t.token_address = `symbol:${sym}`;
    }
    out.push(t);
  }

  // Sort by normalized 24h volume by default
  return out.sort((a, b) => (b.norm_volume_24h || b.volume_24h || b.volume_sol || 0) - (a.norm_volume_24h || a.volume_24h || a.volume_sol || 0));
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
      // Prefer normalized 24h volume; fall back to period volumes
      return (
        t.norm_volume_24h ?? t.volume_24h ?? t.volume_1h ?? t.volume_7d ?? t.volume_sol ?? 0
      );
    case 'price_change':
      return (
        t.price_1hr_change ?? t.price_24h_change ?? t.price_7d_change ?? 0
      );
    case 'market_cap':
      // Prefer CoinGecko market cap, then DEX, then generic
      return t.market_cap_cg ?? t.market_cap_dex ?? t.market_cap_usd ?? 0;
    case 'liquidity':
      // Prefer DEX-reported liquidity
      return t.liquidity_dex ?? t.liquidity_usd ?? 0;
    case 'tx_count':
      return t.transaction_count ?? 0;
    case 'updated_at':
      return t.updated_at ?? 0;
    default:
      return 0;
  }
}
