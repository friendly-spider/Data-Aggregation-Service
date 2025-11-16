import { http } from '../lib/http';
import { TokenNormalized } from '../types/token';
import { tryAcquire } from '../lib/rateLimiter';
import { redis } from '../services/cache';

function getApiKey(): string | undefined {
  return process.env.COINGECKO_API_KEY || process.env.CG_API_KEY;
}

export async function fetchFromCoinGecko(q: string): Promise<TokenNormalized[]> {
  const apiKey = getApiKey();
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers['x-cg-api-key'] = apiKey;
  }

  try {
    const allowed = await tryAcquire('coingecko', 60, 60);
    if (!allowed) {
      console.warn('Rate limited: coingecko');
      await redis.publish('rate_limit:requests', JSON.stringify({ provider: 'coingecko', query: q }));
      return [];
    }

    // 1) Search for matching coins
    const searchUrl = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`;
    const searchRes: any = await http.get(searchUrl, { headers }).json();
    const coins: any[] = searchRes?.coins || [];
    if (!coins.length) return [];

    // Limit to top 25 IDs to avoid huge responses
    const ids = coins.slice(0, 25).map((c: any) => c.id).filter(Boolean);
    if (!ids.length) return [];

    // 2) Fetch market data for those IDs
    const idsParam = ids.join(',');
    const marketsUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(idsParam)}&price_change_percentage=1h,24h,7d`;
    const marketRes: any[] = await http.get(marketsUrl, { headers }).json();

    const now = Date.now();
    return (marketRes || []).map((m: any) => ({
      source: 'coingecko',
      chain: 'coingecko',
      token_address: m.id,
      token_name: m.name,
      token_ticker: m.symbol?.toUpperCase(),
      price_sol: Number(m.current_price) || undefined,
      market_cap_usd: Number(m.market_cap) || undefined,
      volume_24h: Number(m.total_volume) || undefined,
      volume_sol: Number(m.total_volume) || undefined,
      price_1hr_change: m.price_change_percentage_1h_in_currency != null ? Number(m.price_change_percentage_1h_in_currency) : undefined,
      price_24h_change: m.price_change_percentage_24h_in_currency != null ? Number(m.price_change_percentage_24h_in_currency) : undefined,
      price_7d_change: m.price_change_percentage_7d_in_currency != null ? Number(m.price_change_percentage_7d_in_currency) : undefined,
      updated_at: now,
    } as TokenNormalized));
  } catch (e) {
    console.error('CoinGecko error', e);
    return [];
  }
}
