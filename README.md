# Project Backend (Node.js + TypeScript)

A minimal Fastify server written in TypeScript with a health endpoint.

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

Set the environment variable (copy `.env.example` to `.env`):

```env
REDIS_URL=redis://127.0.0.1:6379
```

## Configuration

Copy `.env.example` to `.env` and adjust as needed.
- `PORT`: Port to run the server (default 3000)

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
- Broadcasts messages published to Redis channel `tokens:updates`.
- Example publish:

```bat
docker exec -it rtd-redis redis-cli PUBLISH tokens:updates "{\"type\":\"token_update\",\"q\":\"sol\"}"
```

Client snippet (Node):

```js
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3000/ws');
ws.on('message', (m) => console.log('msg', m.toString()));
```

## Notes
- Uses `dotenv` to load environment variables.
- Uses `ts-node-dev` for fast development reloads.
 - Includes a `got`-based HTTP client in `src/lib/http.ts` with retry/backoff.
 - Aggregation and caching via `src/services/aggregator.ts` and `src/services/cache.ts`.
 - WebSocket broadcaster via `src/services/ws-broadcaster.ts` bridged to Redis Pub/Sub.
 - Snapshot publisher via `src/services/publisher.ts`.

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

## Manual publisher trigger

- Via HTTP:

```bat
curl -X POST "http://localhost:3000/api/publish?q=sol"
```

- Via Node REPL (after build):

```bat
npm run build
node -e "require('./dist/services/publisher').publishSnapshotForQuery('sol')"
```

## Rate limiting
## Frontend demo
After starting API and worker, open the demo UI:

```bat
start http://localhost:3000/
```

The UI lets you:
- Load aggregated tokens with query, period, sort, order, and limit
- Paginate with "Load More" (uses `nextCursor`)
- Connect to WebSocket (filtered by `q`) and see snapshot + delta updates
- Trigger a manual snapshot publish for the current query

- Utility: `src/lib/rateLimiter.ts` (Redis token-bucket via Lua).
- Providers call `tryAcquire('dexscreener'|'jupiter')` before outbound requests. If denied, they skip calling immediately.
- For retries, enqueue with BullMQ (e.g., using `scheduleRefresh`) from an API handler or a separate supervisor process to avoid circular imports in modules.