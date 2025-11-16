import { http } from '../lib/http';
import { TokenNormalized } from '../types/token';
import { tryAcquire } from '../lib/rateLimiter';
import { redis } from '../services/cache';

export async function fetchFromDexScreener(q: string): Promise<TokenNormalized[]> {
  const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`;

  try {
    const allowed = await tryAcquire('dexscreener', 100, 60);
    if (!allowed) {
      // Rate-limited: skip immediate call (a scheduler can requeue)
      // eslint-disable-next-line no-console
      console.warn('Rate limited: dexscreener');
      // Notify worker via Redis Pub/Sub; worker will enqueue with backoff
      await redis.publish('rate_limit:requests', JSON.stringify({ provider: 'dexscreener', query: q }));
      return [];
    }
    const res: any = await http.get(url).json();
    const pairs = res?.pairs || [];

    return pairs.map((p: any) => ({
      source: 'dexscreener',
      chain: p.chainId,
      token_address: p.baseToken?.address,
      token_name: p.baseToken?.name,
      token_ticker: p.baseToken?.symbol,
      price_sol: Number(p.priceUsd) || 0,
      // Period-aware volumes
      volume_24h: Number(p.volume?.h24) || undefined,
      // Legacy total volume field retained for compatibility
      volume_sol: Number(p.volume?.h24) || undefined,
      // USD-denominated fields
      liquidity_usd: Number((p.liquidity && (p.liquidity.usd || p.liquidity)) || 0) || undefined,
      market_cap_usd: Number(p.marketCap || p.fdv) || undefined,
      transaction_count: ((p.txns?.h24?.buys || 0) + (p.txns?.h24?.sells || 0)) || undefined,
      price_1hr_change: (p.priceChange && Number(p.priceChange.h1)) || undefined,
      price_24h_change: (p.priceChange && Number(p.priceChange.h24)) || undefined,
      protocol: p.dexId,
      updated_at: Date.now()
    }));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('DexScreener error', e);
    return [];
  }
}

export async function fetchFromJupiter(q: string): Promise<TokenNormalized[]> {
  const url = `https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(q)}`;

  try {
    const allowed = await tryAcquire('jupiter', 100, 60);
    if (!allowed) {
      // eslint-disable-next-line no-console
      console.warn('Rate limited: jupiter');
      await redis.publish('rate_limit:requests', JSON.stringify({ provider: 'jupiter', query: q }));
      return [];
    }
    const res: any[] = await http.get(url).json();

    return res.map((t: any) => ({
      source: 'jupiter',
      chain: 'solana',
      token_address: t.id,
      token_name: t.name,
      token_ticker: t.symbol,
      price_sol: Number(t.usdPrice) || 0,
      liquidity_usd: Number(t.liquidity) || undefined,
      volume_24h: (t.stats24h?.buyVolume || 0) + (t.stats24h?.sellVolume || 0) || undefined,
      volume_sol: ((t.stats24h?.buyVolume || 0) + (t.stats24h?.sellVolume || 0)) || undefined,
      transaction_count: undefined,
      price_24h_change: (t.stats24h?.priceChange || t.stats24h?.priceChangePercent) ?? undefined,
      protocol: undefined,
      updated_at: Date.now()
    }));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Jupiter error', e);
    return [];
  }
}
