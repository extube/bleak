import type { UserId } from "@ble-id/shared-types";

export type AdvertiseMode = "bluez" | "dry-run";

export interface AdvertInfo {
  id: UserId;
  localName: string;
  serviceUuid: string;
  advHex?: string;
  scanHex?: string;
}

export interface TargetHooks {
  onAdvert?(info: AdvertInfo): void;
  onClaim?(payload: Buffer): void;
  onNote?(message: string): void;
}

export interface AdvertiseTarget {
  readonly mode: AdvertiseMode;
  start(id: UserId): Promise<void>;
  rotate(id: UserId): Promise<void>;
  stop(): Promise<void>;
}
