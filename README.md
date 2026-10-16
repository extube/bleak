# BLE ID Exchange

Exchange short device/user IDs between nearby users:

- **Web client** (SvelteKit PWA) — discovers nearby IDs via the **relay server** over WebSocket (works on iOS, where all browsers lack Web Bluetooth).
- **Native wrapper** (Capacitor + the same Svelte app plus native-bridge plugins) — listens to BLE advertisements **and advertises its own ID**, no server needed (Android users additionally get the direct GATT path as a bonus).
- **Relay server** (Fastify + ws + SQLite) — stores claims and pushes live updates; challenge tokens decide who may claim which code.

## Monorepo layout

```
apps/
  server/     Fastify + ws + better-sqlite3 relay
  web/        SvelteKit PWA (web client)
  native/     Capacitor shell (same Svelte UI + native plugins)
packages/
  shared-types/   protocol types shared across every app
  ble-plugin/     Capacitor plugin: BLE peripheral/advertiser (Android + iOS)
```

## Requirements

- Node 20+
- iOS/Android builds for `apps/native`: Xcode 15+ / Android Studio + `npx cap add ios android` once.

## Quick start (dev)

```bash
npm install
npm run dev:server   # relay on http://localhost:8787
npm run dev:web      # web client on http://localhost:5173
```

Open two browser windows (or phone + desktop on the same network) to see IDs relayed live. The native app itself is serverless for BLE: it produces and consumes advertisements on the phone, and syncs with the relay only when one is reachable.

## The flows this repo implements

| Flow | Where | Behavior |
|---|---|---|
| A. Direct BLE (Android only) | native app ↔ web client | wrapper advertises a service; web client connects via Chrome `requestDevice` and writes an ID claim |
| B. Relay (all platforms) | web ↔ server ↔ native | web posts ID + exchange token; native subscribes over WebSocket and starts advertising |
