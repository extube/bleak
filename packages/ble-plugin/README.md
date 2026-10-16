# @ble-id/ble-plugin

Capacitor plugin for the **peripheral role** (advertise + GATT claim endpoint) — the half no browser supports.

## Status: scaffolded, native implementations to be filled in

| File | Role |
|---|---|
| `src/index.ts` | TS API + auto-registration for Capacitor |
| `android/src/main/java/com/bleid/bleplugin/BlePeripheralPlugin.kt` | Android impl (Kotlin) |
| `ios/Plugin/BlePeripheralPlugin.swift` | iOS impl (Swift / CoreBluetooth) |

## API

```ts
import { BlePeripheral } from "@ble-id/ble-plugin";

await BlePeripheral.isSupported();
await BlePeripheral.getActiveExchange();

await BlePeripheral.startAdvertising({
  serviceUuid: "B1E4D1A0-…0001", // WRAPPER_SERVICE_UUID from @ble-id/shared-types
  localName: "IdNode",
});

await BlePeripheral.setActiveExchange({ exchangeCode: "8F3K2D" });

BlePeripheral.addListener("claimReceived", ({ claim }) => {
  // claim: JSON IdClaim written by a web client or another native user
});

await BlePeripheral.stopAdvertising();
```

## Native TODO (the ~150 lines that remain)

### Android (`BlePeripheralPlugin.kt`)
1. `BluetoothManager.adapter.bluetoothLeAdvertiser` → `startAdvertising` with
   `AdvertiseSettings` (CONNECTABLE, TX_MEDIUM) and `AdvertiseData` containing the
   128-bit service UUID.
2. `BluetoothGattServer` via `manager.openGattServer(context, callback)`: service
   UUID `…0001`, characteristic `…0002` (WRITE, no response needed) —
   `onCharacteristicWriteRequest` → parse JSON → emit `claimReceived` event.
3. Characteristic `…0003` (READ): serve `activeExchangeCode`.
4. Permissions: `BLUETOOTH_ADVERTISE` + `BLUETOOTH_CONNECT` (API 31+),
   `ACCESS_FINE_LOCATION` (API ≤ 30). Add to plugin `AndroidManifest.xml`.

### iOS (`BlePeripheralPlugin.swift`)
1. `CBPeripheralManager` + delegate: `startAdvertising([CBAdvertisementDataServiceUUIDsKey: …])`.
2. `CBMutableCharacteristic` for `…0002` (`.write`, no authorization) —
   `didReceiveWrite` → emit `claimReceived`; `…0003` `.read` serves the code.
3. `Info.plist`: `NSBluetoothPeripheralUsageDescription` + `NSBluetoothAlwaysUsageDescription`.

## Verification checklist when implementing

- [ ] `adb logcat` shows advertise state on entry/exit; two physical Android devices needed for E2E test
- [ ] Chrome desktop can discover the wrapper mid-pair with `requestDevice({ filters: [{ services: [WRAPPER_SERVICE_UUID] }] })`
- [ ] write from web → `claimReceived` event fires
- [ ] iOS: accept the `CoreBluetooth` foreground permission before advertising; test on physical iOS 15+ device
