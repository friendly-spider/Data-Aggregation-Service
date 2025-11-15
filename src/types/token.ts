export type TokenNormalized = {
  source?: string;
  chain: string;
  token_address: string;
  token_name?: string;
  token_ticker?: string;
  price_sol?: number;
  volume_sol?: number;
  liquidity_sol?: number;
  market_cap_sol?: number;
  transaction_count?: number;
  price_1hr_change?: number;
  protocol?: string;
  updated_at?: number;
};
