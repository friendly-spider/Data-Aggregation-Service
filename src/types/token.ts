export type TokenNormalized = {
  source?: string;
  chain: string;
  token_address: string;
  token_name?: string;
  token_ticker?: string;
  price_sol?: number;
  volume_sol?: number;
  // USD-denominated fields
  liquidity_usd?: number;
  market_cap_usd?: number;
  // Period-aware fields
  volume_1h?: number;
  volume_24h?: number;
  volume_7d?: number;
  transaction_count?: number;
  price_1hr_change?: number;
  price_24h_change?: number;
  price_7d_change?: number;
  protocol?: string;
  updated_at?: number;
};
