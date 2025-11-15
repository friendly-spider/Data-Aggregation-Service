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