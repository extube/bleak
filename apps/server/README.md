# Relay server

Fastify + ws + SQLite via Node's built-in `node:sqlite` (no native modules, no
build tools needed).

```
npm run dev        # tsx watch, port 8787 (PORT env to override)
```

- `GET  /health` — liveness
- `POST /api/exchange-code` — dev helper: `{ userId, exchangeCode }` → verified hash (real deployment: native app mints codes itself)
- `WS   /` (same port) — relay protocol, types in `packages/shared-types` (`ClientMessage` in, `RelayEvent` out + `claim-result` acks)

SQLite at `./claims.db` (WAL mode, `SQLITE_PATH` to relocate, has zero
prerequisites). Claims expire (`CLAIM_TTL_MS`); the server never stores
raw tokens — SHA-256 only.

## Serving the web client from the same server

Set `WEB_DIST_DIR=../web/build` (or `../web/.svelte-kit/output` after `svelte-kit build`) and the Fastify instance will serve the SPA with index.html fallback. If unset, purely socket server.
