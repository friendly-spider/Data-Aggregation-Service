import { http } from '../lib/http';
import { TokenNormalized } from '../types/token';
import { tryAcquire } from '../lib/rateLimiter';

export async function fetchFromDexScreener(q: string): Promise<TokenNormalized[]> {
  const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`;

  try {
    const allowed = await tryAcquire('dexscreener', 100, 60);
    if (!allowed) {
      // Rate-limited: skip immediate call (a scheduler can requeue)
      // eslint-disable-next-line no-console
      console.warn('Rate limited: dexscreener');
      return [];
    }
    const res: any = await http.get(url).json();
    const pairs = res?.pairs || [];

    return pairs.map((p: any) => ({
      source: 'dexscreener',
      chain: p.chainId,
      token_address: p.baseToken?.address,
      token_name: p.baseToken?.name,
      // Mapping USD fields to *_sol schema names as per spec
      price_sol: Number(p.priceUsd) || 0,
      volume_sol: Number(p.volume?.h24) || 0,
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
      return [];
    }
    const res: any = await http.get(url).json();

    return res.map((t: any) => ({
      source: 'jupiter',
      chain: 'solana',
      token_address: t.id,
      token_name: t.name,
      price_sol: Number(t.usdPrice) || 0,
      liquidity_sol: Number(t.liquidity) || 0,
      volume_sol: (t.stats24h?.buyVolume || 0) + (t.stats24h?.sellVolume || 0),
      updated_at: Date.now()
    }));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Jupiter error', e);
    return [];
  }
}
