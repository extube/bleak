# Native wrapper (Capacitor + Svelte)

Same Svelte runtime as the web client, plus native plugins that give the BLE
**peripheral role** (`packages/ble-plugin`) — advertise your own ID, receive
claims over GATT. BLE works fully offline/serverless here.

## One-time native project generation

```bash
npx cap add ios
npx cap add android
npm run cap:sync
```

(Includes platform-specific manifests already handled by the plugin; iOS needs
`NSBluetoothAlwaysUsageDescription`, which `npx cap` copies from the plugin's
template.)

## Dev loop

```bash
npm run dev          # UI at http://localhost:5174 (hot reload in desktop browser)
npm run build
npm run cap:sync
# then open ios/App/App.xcodeproj or android/ in Android Studio and Run
```

## Where things live

- `src/App.svelte` — the only UI file; reuses the web palette (app-shared.css)
- `packages/ble-plugin` — the actual native halves (Kotlin / Swift), TODOs marked
