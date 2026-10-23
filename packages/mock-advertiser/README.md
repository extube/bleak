# @ble-id/mock-advertiser

Mock BLE peripheral as a CLI for **desktop Linux (BlueZ)**. Rotates and
advertises IDs derived from sha256 (e.g. `1A2B3C4D5E`) so you can exercise the
central side (web Bluetooth, `nRF Connect`, phones) without a real device.

Each rotation generates fresh random bytes and advertises the first
**10 hex characters** of their `sha256` digest — the maximum that fits the
legacy 31-byte advertisement packet.

## Quick start

```bash
# from the repo root
npm run mock -w @ble-id/mock-advertiser              # real BLE via BlueZ
npm run mock -w @ble-id/mock-advertiser -- --dry-run # log payloads only
npx ble-mock-advertiser --help
```

Dry-run is also the automatic fallback when `bluetoothd`/the system bus is
unavailable — the CLI logs what it *would* advertise and exits cleanly.

## What it advertises

- **Service data** for `org.bluez.LEAdvertisement1`:
  - UUID: `WRAPPER_SERVICE_UUID` (`packages/shared-types`),
  - payload: the ASCII sha256 prefix, refreshed every rotation.
- **Local name**: `BLE-ID <ID>` (BlueZ moves it to the scan response if the
  legacy 31-byte packet would overflow).
- **GATT service** (when the adapter supports `GattManager1`):
  - `WRAPPER_EXCHANGE_CHAR_UUID` — read → current ASCII ID,
  - `WRAPPER_CLAIM_CHAR_UUID` — write → claim payload, logged to stdout
    (forward the bytes to the relay yourself if you want a fake end-to-end).

ID rotation: each interval the CLI unregisters the old advertisement and
registers a fresh one (robust across BlueZ versions).

## Options

| Flag              | Meaning                                   | Default   |
| ----------------- | ----------------------------------------- | --------- |
| `--interval <ms>` | ID rotation period                        | `5000`    |
| `--id <ID>`       | fixed ID: 10-char hex sha256 prefix or 6-char charset ID | — |
| `--prefix <name>` | local-name prefix (printable ASCII)       | `BLE-ID`  |
| `--duration <ms>` | exit after `<ms>`                         | —         |
| `--once`          | emit one ID and exit                      | —         |
| `--dry-run`       | stdout only, never touch Bluetooth        | —         |
| `--json`          | JSON-lines output for scripts/tests       | —         |
| `-h`, `--help`    | show help                                 | —         |

`--json` events: `ready`, `advert`, `claim`, `note`, `stop`, `error`.

## Real-BlueZ requirements (Linux desktop)

- `bluetoothd` running and an LE-capable adapter (`org.bluez.LEAdvertisingManager1`).
- Permission to register applications/advertisements: run with `sudo`, or add
  a polkit rule / `setcap cap_net_raw+eip` for the node binary. Typical error
  without privileges: `RegisterApplication failed: Access Denied`.
- The CLI powers the adapter (`Powered=true`); disable other agents (e.g.
  desktop tray) that fight over the adapter while testing.

These paths were designed against the BlueZ D-Bus API and are validated by
unit tests only through a **mocked transport** — the real-BlueZ layer itself
requires physical hardware and is not exercised by `npm test`.

## Tests

```bash
npm test -w @ble-id/mock-advertiser
```

Covers ID generation, AD payload building (31-byte limit, UUID endianness,
scan-response name) and the rotation session with a recording fake target.
