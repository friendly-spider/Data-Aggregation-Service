export type TokenNormalized = {
  source?: string;
  chain: string;
  token_address: string;
  token_name?: string;
  price_sol?: number;
  volume_sol?: number;
  liquidity_sol?: number;
  updated_at?: number;
};
