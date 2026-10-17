# Relay server

Fastify + ws + SQLite via Node's built-in `node:sqlite` (no native modules, no
build tools needed).

```
npm run dev        # tsx watch, port 8787 (PORT env to override)
```

- `GET  /health` — liveness
- `POST /api/exchange-code` — dev helper: activates an exchange code for claims (real deployment: native app mints codes itself)
- `WS   /` (same port) — relay protocol, types in `packages/shared-types` (`ClientMessage` in, `RelayEvent` out + `claim-result` acks)

### Users API

- `POST   /api/users` — create: `{ userId, publicBio?, privateBio?, meta? }` → 201 profile, 409 if userId exists
- `GET    /api/users/:userId` — active profile (404 if missing or soft-deleted)
- `PATCH  /api/users/:userId` — partial update: any of `publicBio/privateBio/meta` (404 unknown, 410 soft-deleted)
- `DELETE /api/users/:userId` — **soft delete**: tombstones the row (`deleted_at`), history preserved
- `DELETE /api/users/:userId/force` — **force delete**: wipes the row outright, no undo

Field limits (`USER_FIELD_LIMITS` in shared-types): `publicBio` ≤ 128, `privateBio` ≤ 128, `meta` ≤ 256.

SQLite at `./claims.db` (WAL mode, `SQLITE_PATH` to relocate, has zero
prerequisites). Claims expire (`CLAIM_TTL_MS`); the server never stores
raw tokens — SHA-256 only.

## Serving the web client from the same server

Set `WEB_DIST_DIR=../web/build` (or `../web/.svelte-kit/output` after `svelte-kit build`) and the Fastify instance will serve the SPA with index.html fallback. If unset, purely socket server.
