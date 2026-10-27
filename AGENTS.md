# AGENTS.md

## Project owner

- **extube** — <extube@protonmail.com>
- Commits in this repo are authored as `extube <extube@protonmail.com>`; set
  git identity accordingly before committing.

## Project overview

**ble-id** — a BLE-based identity exchange. Devices share short human-readable
IDs (e.g. `AB3F2K`) over Bluetooth or a relay server, with one-time tokens
proving ownership.

Monorepo (npm workspaces + turbo):

| Path | Purpose |
|---|---|
| `packages/shared-types` | Protocol types, BLE UUIDs, field limits — single source of truth |
| `packages/ble-plugin` | Capacitor BLE-peripheral plugin (Kotlin/Swift scaffolded, TODOs in its README) |
| `packages/mock-advertiser` | Desktop-Linux CLI mock BLE peripheral (BlueZ D-Bus, tsx-run, no build); dry-run fallback |
| `apps/server` | Fastify + ws + SQLite (built-in `node:sqlite`) relay; rooms/users REST API on `/api/room/...` |
| `apps/web` | SvelteKit SPA (`ssr = false`, adapter-static) — claims IDs via relay |
| `apps/native` | Capacitor shell reusing the same Svelte app + BLE plugin |

- Node ≥ 24 (built-in `node:sqlite`, no native build toolchain); npm 11
  (`packageManager` pinned).
- `shared-types` is consumed as raw TS — its package exports point at
  `src/index.ts`, there is no build step for it. `ble-plugin` does compile
  to `dist/`.

## Commands

```bash
npm run build        # turbo: shared-types → ble-plugin → apps
npm run typecheck    # all packages
npm test             # node:test + tsx (server and mock-advertiser)
npm run dev          # server :8787 + web :5173 + native :5174, parallel
```

- One workspace: `npm test -w @ble-id/server`. One file, from `apps/server`:
  `node --import tsx --test test/store.test.ts`.
- Server tests use fastify `inject()` (no socket, port 0) and a throwaway
  SQLite file per test in a tmp dir — no services or fixtures required.
- Web "lint" is `prettier --check .`; web typecheck is `svelte-check`.

### Web ↔ relay in dev (gotcha)

The web client connects to `ws(s)://<location.host>/ws`, and the Vite dev
server has **no proxy** — `npm run dev:web` alone never reaches the relay.
To exercise the full flow, serve the built SPA from the relay:

```bash
npm run build -w @ble-id/web
WEB_DIST_DIR=../web/build npm run dev:server   # SPA + WS on :8787
```

`POST /api/exchange-code` is the dev helper that mints a live code.

## Git rules

Enforced programmatically by repo hooks in `.githooks/` (activate after
cloning: `git config core.hooksPath .githooks`; installs `pre-commit`,
`pre-merge-commit`, `post-merge`, `pre-push`).

- **Never push without an explicit user order.** No "tidy-up pushes": pushing
  happens only when the user asks, every time.
- **`main` is protected**: local pushes *to* `main` and local merges *into*
  `main` are blocked by hooks. `main` is release-only — changes land via a
  dev→main pull request opened by the owner. Never push `main` from a session.
- **Never commit directly to `dev` or `main`** (pre-commit blocks both, except
  a `git commit` finishing a `git merge --squash` on `dev`).
- **Branch naming** (pre-commit refuses commits on differently named branches):
  - `feat/#<task-number>-<short-name>` — feature work
  - `bug/#<task-number>-<short-name>` — bug fixes
  - `hotfix/#<task-number>-<short-name>` — release hotfixes
- **Merges into `dev`**: any branch may be merged (hooks do not care about the
  source branch name), but landing on `dev` is **squash-only**
  (`git merge --squash <branch>` + a `feat|fix: [#n]` commit). Illegal
  merge commits and fast-forwards into `dev` are auto-unwound by the
  `post-merge` hook. The only merge-commit exception is **syncing from
  `main` into `dev`**.
- Sync first per task: pull latest `main`, merge `main` into `dev` (keeps `dev`
  ahead-or-equal of `main`, so PRs are clean).
- Commits: `feat: [#<task-number>] - <description>` (or `fix:`).

## Security notes

- **Tokens are never stored raw.** Claim tokens are SHA-256-hashed in SQLite;
  a raw token appears only transiently in the WS claim flow.
- **One-time claims.** One claim slot per exchange code: a foreign claimant
  gets `code-already-claimed`; the same user re-claiming with a stale token
  burns and re-opens their own slot.
- **Soft vs force delete.** `DELETE` tombstones rows (`deleted_at` → 410 on
  further use); `DELETE .../force` wipes outright. Separate routes — never
  collapse them into one with a query flag.
- **Profile privacy.** `privateBio` is owner-scoped — never broadcast over the
  relay or included in share payloads. Only `userId`, `name`, `publicBio` are
  safe to expose.
- **No auth yet.** The API has zero authentication — fine for local dev on a
  trusted network; do not deploy publicly. Don't "fix" this quietly by
  embedding secrets; flag it instead.
- **Length limits** live in `packages/shared-types` (`USER_FIELD_LIMITS`,
  `ROOM_FIELD_LIMITS`); the store clamps again. Change them in one place only.

## Native app (`apps/native`)

One-time per clone (needs real Xcode / Android SDKs): `npx cap add ios` or
`npx cap add android`, then `npm run cap:sync`. Dev loop: `npm run dev`
(UI on :5174), `npm run build`, `npm run cap:sync`, then open `ios/App/` or
`android/` in the IDE. The native BLE halves are stubs — see TODOs in
`packages/ble-plugin/README.md` before planning any BLE work.

## Cross-device quirks

- **Git "dubious ownership"** (repo touched by another user):
  `git config --global --add safe.directory <repo-path>`.
- **SQLite** `apps/server/claims.db` is machine-local and gitignored — never
  commit it; relocate via `SQLITE_PATH`.
- **BLE per platform**: web Bluetooth (central role) works on Android/desktop
  Chrome; it is unavailable on iOS, where the Capacitor plugin is the only
  route. E2E BLE needs physical devices.
- **Ports**: server 8787 (HTTP + WS share one port), web 5173, native 5174.
  Override the server via `PORT`.
