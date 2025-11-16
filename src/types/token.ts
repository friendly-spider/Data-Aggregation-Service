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
  // Period-aware tx counts (some providers only offer 1h/24h)
  transaction_count_1h?: number;
  transaction_count_24h?: number;
  transaction_count_7d?: number;
  // Legacy aggregate tx count (default to 24h when available)
  transaction_count?: number;
  price_1hr_change?: number;
  price_24h_change?: number;
  price_7d_change?: number;
  protocol?: string;
  updated_at?: number;
};
