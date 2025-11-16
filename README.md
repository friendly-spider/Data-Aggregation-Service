# Data Aggregation Service (Node.js + TypeScript)

Fast, real-time token aggregation with Fastify, Redis, and WebSockets. Merges data from DexScreener, Jupiter, and CoinGecko into a normalized model, serves a REST API for initial load, and streams live updates over WS.

Hosted at: https://data-aggregation-service-1kxm.onrender.com/

## Quick Start

1) Install dependencies

```bat
npm install
```

2) Run in dev mode (auto-reload)

```bat
npm run dev
```

3) Build for production

```bat
npm run build
```

4) Start compiled server

```bat
npm start
```

5) Health check

```bat
curl http://localhost:3000/health
```

## Redis (Local Dev)

Run Redis via Docker:

```bat
docker run -p 6379:6379 --name rtd-redis -d redis:7
```

Set environment variables using `.env` (already supported via `dotenv`). See below.

## Configuration

Create `.env` at the project root and adjust as needed:

```env
PORT=3000
REDIS_URL=redis://127.0.0.1:6379
# CoinGecko API key header (https://docs.coingecko.com/docs/setting-up-your-api-key)
COINGECKO_API_KEY=your-key-here
# Interval for automatic WS updates based on active queries (ms)
PUBLISH_INTERVAL_MS=15000
```

Notes:
- `.gitignore` excludes `.env`.
- You can also set `CG_API_KEY` instead of `COINGECKO_API_KEY`.

## Endpoints
- `GET /health` → `{ "status": "ok" }`
 - `GET /api/tokens?q=sol` → Aggregated results from providers, cached via Redis
	 - Query params:
		 - `sort` = `volume | price_change | market_cap | liquidity | tx_count | updated_at` (default `volume`)
		 - `order` = `asc | desc` (default `desc`)
		 - `limit` = number (1..100, default 20)
		 - `cursor` = opaque string for pagination (returned as `nextCursor`)
		 - `period` = `1h | 24h | 7d` (affects `volume` and `price_change` sort keys)

## Data Schema
Normalized token shape returned by the API (fields optional depending on source coverage):

```json
{
	"chain": "solana",
	"token_address": "576P1t7XsRL4ZVj38LV2eYWxXRPguBADA8BxcNz1xo8y",
	"token_name": "PIPE CTO",
	"token_ticker": "PIPE",
	"price_sol": 4.4141209798877615e-7,
	"market_cap_usd": 441.41,
	"volume_24h": 1322.44,
	"liquidity_usd": 149.36,
	"transaction_count": 2205,
	"price_1hr_change": 120.61,
	"price_24h_change": 15.2,
	"protocol": "Raydium CLMM",
	"updated_at": 1731715200000
}
```

## WebSocket
- Path: `ws://localhost:3000/ws`
- Server forwards messages from Redis Pub/Sub channel `tokens:updates` to connected clients.
- Filtering: Clients can set/query filters so they only receive relevant updates.

Client snippet (Node):

```js
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3000/ws');
ws.on('open', () => {
	ws.send(JSON.stringify({ type: 'setFilter', q: 'sol', period: '24h' }));
});
ws.on('message', (m) => console.log('msg', m.toString()));
```

Message types:
- `snapshot`: compact bulk snapshot for a query
- `delta`: per-token updates (price changes, volume spikes)

Automatic updates:
- The server periodically publishes snapshots/deltas for the set of active WS queries every `PUBLISH_INTERVAL_MS`. 

## Notes
- Uses `dotenv` to load environment variables.
- Uses `ts-node-dev` for fast development reloads.
 - `got`-based HTTP client: `src/lib/http.ts` (retry/backoff with jitter).
 - Aggregation & cache: `src/services/aggregator.ts`, `src/services/cache.ts`.
 - WS broadcaster + filters: `src/services/ws-broadcaster.ts`.
 - Snapshot/deltas: `src/services/publisher.ts`.
 - Data providers: `src/clients/dexClients.ts`, `src/clients/gecko.ts`.

## Worker
Run a dedicated worker process for BullMQ jobs:

```bat
npm run build
npm run worker
```

Dev mode:

```bat
npm run worker:dev
```

## Rate limiting

- Utility: `src/lib/rateLimiter.ts` (Redis token-bucket via Lua).
- Providers call `tryAcquire('dexscreener'|'jupiter'|'coingecko')` before outbound requests. If denied, they skip immediate calls and publish to `rate_limit:requests`; a bridge re-enqueues refresh with backoff.

## Frontend demo
After starting API and worker, open the demo UI:

```bat
start http://localhost:3000/
```

The UI lets you:
- Load aggregated tokens with query, period, sort, order, and limit
- Paginate with "Load More" (uses `nextCursor`)
- Connect to WebSocket (filtered by `q`) and see snapshot + delta updates

Filtering after initial load happens locally (no additional HTTP calls). The client also sends WS `setFilter` messages so the server only streams relevant deltas.

## Data Sources
- DexScreener: pairs, volumes (1h/24h), price change, liquidity
- Jupiter: token info, 24h stats (buy/sell volume), USD price
- CoinGecko: markets (USD price, market cap, total volume, price change 1h/24h/7d)


## Concise Design Decisions
- Fastify over Express: higher throughput, plugin architecture, typed schema, structured logging.
- Native `ws` over Socket.IO: lower overhead, easy Redis Pub/Sub integration, full control over payloads.
- Redis as a central layer: cache, rate limits, pub/sub, BullMQ storage; enables horizontal scale.
- `got` HTTP client: retries, exponential backoff with jitter; resilient to upstream blips.
- BullMQ for jobs: retries/backoff/concurrency; decouples workers from API.
- Pub/Sub separation: workers produce, API delivers; consistent broadcasts across instances.
- Normalized merge model: merge by `(chain, token_address)`, sum volumes, max liquidity/market cap, freshest price.
- Cursor pagination: stable ordering under live updates.
- Delta-first WS: efficient payloads and better UI responsiveness.
