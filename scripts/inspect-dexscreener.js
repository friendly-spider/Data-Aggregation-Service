// Simple inspector: fetches DexScreener search and logs fields relevant to period metrics.
// Usage (cmd.exe):
//   cd c:\Stuff\College\Project
//   node scripts\inspect-dexscreener.js sol

const https = require('https');

const q = process.argv[2] || 'sol';
const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`;

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => (data += chunk));
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      const pairs = json.pairs || [];
      for (let i = 0; i < Math.min(5, pairs.length); i++) {
        const p = pairs[i];
        const row = {
          name: `${p.baseToken?.symbol || ''}/${p.quoteToken?.symbol || ''}`.trim(),
          chainId: p.chainId,
          address: p.baseToken?.address,
          priceUsd: p.priceUsd,
          liquidity_usd: p.liquidity?.usd ?? p.liquidity,
          marketCap: p.marketCap ?? p.fdv,
          volume_h1: p.volume?.h1,
          volume_h24: p.volume?.h24,
          txns_h1: (p.txns?.h1?.buys || 0) + (p.txns?.h1?.sells || 0),
          txns_h24: (p.txns?.h24?.buys || 0) + (p.txns?.h24?.sells || 0),
          priceChange_h1: p.priceChange?.h1,
          priceChange_h24: p.priceChange?.h24,
        };
        console.log(row);
      }
    } catch (e) {
      console.error('Parse error', e.message);
      console.log(data.slice(0, 500));
    }
  });
}).on('error', (e) => console.error('HTTP error', e.message));
