/// <reference types="@capacitor/cli" />

import { registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";

/**
 * BLE peripheral role — the part no browser API supports.
 *
 * Native implementations (to be filled in):
 *  - Android: android.bluetooth.le.BluetoothLeAdvertiser + BluetoothGattServer
 *  - iOS:     CoreBluetooth CBPeripheralManager
 *
 * Lifecycle: startAdvertising() → set claim characteristic (write endpoint)
 * → onClaimReceived fires when another device writes an IdClaim into it.
 */
export interface BlePeripheralPlugin {
  /**
   * Start advertising the wrapper service + an active claim endpoint.
   * Android local-name is capped at 31 bytes; device name is preferred.
   */
  startAdvertising(options: {
    /** Human-readable local name (defaults to device name). */
    localName?: string;
    /** Primary service UUID that filters on the Chrome device picker. */
    serviceUuid: string;
    /** Whether to include the device in scan responses (name/value). */
    includeTxPower?: boolean;
  }): Promise<void>;

  /** Stop everything and give the radio back. */
  stopAdvertising(): Promise<void>;

  /** Find out whether this handset can advertise (plus endpoints). */
  isSupported(): Promise<{
    supported: boolean;
    /** true on iOS; Android needs LE Extended Advertising on some OEM stacks */
    peripheralModeAvailable: boolean;
  }>;

  /** What the wrapper is currently broadcasting (for display/verification). */
  getActiveExchange(): Promise<{ exchangeCode: string | null }>;

  /** Push a fresh exchange code the wrapper shows on screen + serves on read. */
  setActiveExchange(options: { exchangeCode: string }): Promise<void>;

  addListener(
    eventName: "claimReceived",
    listener: (event: { claim: string }) => void,
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: "advertisingStarted",
    listener: () => void,
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: "advertisingError",
    listener: (event: { message: string }) => void,
  ): Promise<PluginListenerHandle>;

  removeAllListeners(): Promise<void>;
}

export const BlePeripheral = registerPlugin<BlePeripheralPlugin>(
  "BlePeripheral",
  { web: undefined },
);
