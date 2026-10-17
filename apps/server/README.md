# Relay server

Fastify + ws + SQLite via Node's built-in `node:sqlite` (no native modules, no
build tools needed).

```
npm run dev        # tsx watch, port 8787 (PORT env to override)
```

- `GET  /health` — liveness
- `POST /api/exchange-code` — dev helper: activates an exchange code for claims (real deployment: native app mints codes itself)
- `WS   /` (same port) — relay protocol, types in `packages/shared-types` (`ClientMessage` in, `RelayEvent` out + `claim-result` acks)

### Rooms API

- `POST   /api/room` — create: `{ roomId?, name? }`; omit `roomId` to auto-generate — 201 room, 409 duplicate
- `GET    /api/room/:roomId` — active room (404 if missing/soft-deleted)
- `PATCH  /api/room/:roomId` — rename: `{ name }` (≤128 chars)
- `DELETE /api/room/:roomId` — **soft delete**: tombstones the room; member users survive but every room-scoped route answers 410

### Users API (room-scoped)

All user routes live under their room and answer 404/410 if the room is missing/soft-deleted.

- `POST   /api/room/:roomId/users` — create: `{ userId, publicBio?, privateBio?, meta? }` → 201, 409 duplicate
- `GET    /api/room/:roomId/users/:userId` — active profile in that room
- `PATCH  /api/room/:roomId/users/:userId` — partial update of `publicBio/privateBio/meta`
- `DELETE /api/room/:roomId/users/:userId` — **soft delete**: tombstones the row
- `DELETE /api/room/:roomId/users/:userId/force` — **force delete**: wipes the row outright, no undo

### Migration

- `POST /api/room/:roomId/users/:userId/migrate` — copies the user into another
  room: body `{ roomId, userId }` (target identity). All fields (bios, meta)
  are kept; only the id changes. The source user is untouched — a copy, not a
  move. Target room must exist, be active, and differ from the source; target
  userId must be free.

Field limits (`USER_FIELD_LIMITS` in shared-types): `publicBio` ≤ 128, `privateBio` ≤ 128, `meta` ≤ 256.

SQLite at `./claims.db` (WAL mode, `SQLITE_PATH` to relocate, has zero
prerequisites). Claims expire (`CLAIM_TTL_MS`); the server never stores
raw tokens — SHA-256 only.

## Serving the web client from the same server

Set `WEB_DIST_DIR=../web/build` (or `../web/.svelte-kit/output` after `svelte-kit build`) and the Fastify instance will serve the SPA with index.html fallback. If unset, purely socket server.
