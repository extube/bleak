import { WRAPPER_SERVICE_UUID } from "@ble-id/shared-types";
import { buildAdvertisementPayloads } from "./payload.js";
import type { AdvertiseTarget, TargetHooks } from "./types.js";

/**
 * Logs the computed advertisement payloads instead of touching Bluetooth.
 * Used for automated tests and as the automatic fallback when BlueZ is
 * unavailable — never permanently relied on, see README.
 */
export class DryRunTarget implements AdvertiseTarget {
  readonly mode: "dry-run" = "dry-run";

  private readonly hooks: TargetHooks;

  constructor(hooks: TargetHooks = {}) {
    this.hooks = hooks;
  }

  async start(id: string): Promise<void> {
    this.emit(id);
  }

  async rotate(id: string): Promise<void> {
    this.emit(id);
  }

  async stop(): Promise<void> {
    // nothing to release
  }

  private emit(id: string): void {
    const payloads = buildAdvertisementPayloads(id);
    this.hooks.onAdvert?.({
      id,
      localName: payloads.localName,
      serviceUuid: WRAPPER_SERVICE_UUID,
      advHex: payloads.advertisementData.toString("hex"),
      scanHex: payloads.scanResponse.toString("hex"),
    });
  }
}
