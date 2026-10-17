# AGENTS.md

## Project owner

- **extube** — <extube@protonmail.com>
- Commits in this repo are authored as `extube <extube@protonmail.com>`; agents
  and contributors must set git identity accordingly before committing.

## Overview

Guide for AI agents and contributors working on this repository.

## Project overview

**ble-id** — a BLE-based identity exchange system. Nearby devices share short
human-readable IDs (e.g. `AB3F2K`) over Bluetooth or a relay server, with
one-time tokens proving ownership.

Monorepo layout (npm workspaces + turbo):

| Path | Purpose |
|---|---|
| `packages/shared-types` | Protocol types, BLE UUIDs, field limits — single source of truth |
| `packages/ble-plugin` | Capacitor BLE-peripheral plugin (Kotlin/Swift stubs, TODOs in its README) |
| `apps/server` | Fastify + ws + SQLite (built-in `node:sqlite`) relay; rooms/users REST API on `/api/room/...` |
| `apps/web` | SvelteKit PWA — claim IDs via relay, share own ID |
| `apps/native` | Capacitor shell reusing the same Svelte app + BLE plugin |

Runs on Node ≥ 24 (uses built-in `node:sqlite`, no native build toolchain).

## Git rules

### Branch flow

- Every feature/fix branch is created **from `dev`**.
- **Never merge into `dev` or `main` without asking the user first.**
- `main` is checked out **only for hotfixes**; hotfix branches are merged back
  to `main` (and only with the user's approval, as above).

### Branch naming

```
feat/#<task-number>-<short-task-name>
fix/#<task-number>-<short-task-name>
```

Examples: `feat/#6-migrate-endpoint`, `fix/#12-sqlite-lock`.

### Commit structure

```
feat: [#<task-number>] - <description>
fix:  [#<task-number>] - <description>
```

Example: `feat: [#5] - add exchange-code TTL enforcement`

## Security notes

- **Tokens are never stored raw.** Claim tokens are kept as SHA-256 hashes in
  SQLite; a raw token only appears transiently in the WS claim flow.
- **One-time claims.** A claimed exchange code is a single slot: a foreign
  claimant receives `code-already-claimed`; the same user re-claiming with a
  stale token burns and re-opens their own slot.
- **Soft vs force delete.** `DELETE` tombstones rows (`deleted_at`);
  `DELETE .../force` wipes them outright. Both exist as separate routes —
  never collapse them into one with a query flag.
- **Profile privacy.** `privateBio` is owner-scoped data; do not broadcast it
  over the relay or include it in share payloads. Only `userId`, `name`,
  `publicBio` are safe to expose to others.
- **No auth yet.** The current API has zero authentication — fine for local
  dev on a trusted network; do not deploy publicly before adding an auth
  layer. Don't "fix" this quietly by embedding secrets; flag it instead.
- **Length limits** are enforced in `packages/shared-types`
  (`USER_FIELD_LIMITS`, `ROOM_FIELD_LIMITS`) and clamped again in the store.
  Update limits in one place only.

## Setup on different devices

### Prerequisites

- Node ≥ 24.18 (`node:sqlite` is builtin — nothing to compile)
- npm ≥ 11
- For native wrapper: Xcode (iOS) / Android Studio (Android) + JDK 17

### Fresh machine setup

```bash
npm install          # resolves all workspaces
npm run build        # turbo: shared-types → ble-plugin → apps
npm run dev          # everything
# or per app:
npm run dev:server   # relay on :8787 (PORT env to override)
npm run dev:web      # SvelteKit on :5173
```

### Native apps (`apps/native`)

Run once per machine/clone (requires real Xcode/Android SDKs):

```bash
cd apps/native
npm install
npx cap add ios      # or: npx cap add android
npx cap sync
```

Then open `ios/App/` in Xcode or `android/` in Android Studio.

### Cross-device quirks

- **Git "dubious ownership"** — if the repo is cloned/touched by another user:
  `git config --global --add safe.directory <repo-path>`.
- **SQLite file** (`apps/server/claims.db`) is machine-local; it's gitignored —
  never commit it. Custom location via `SQLITE_PATH`.
- **BLE behaves differently per platform**: web Bluetooth (central role) works
  on Android/desktop Chrome, and it's unavailable on iOS — there the native
  wrapper (Capacitor plugin) is the only route. Keep this in mind when testing
  flows on different devices.
- **Ports**: server 8787 (HTTP+WS share one port), web dev 5173. If two
  projects run concurrently, override via `PORT` / Vite config.
