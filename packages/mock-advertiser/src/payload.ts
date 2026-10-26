import {
  APP_ID_ORIGINAL,
  BEACON_APP_ID_BYTES,
  BEACON_SERVICE_UUID,
  BEACON_USER_ID_BYTES,
  type UserId,
} from "@ble-id/shared-types";

export const DEFAULT_NAME_PREFIX = "BLE-ID";

export interface AdvertisementPayloads {
  advertisementData: Buffer;
  scanResponse: Buffer;
  localName: string;
}

function uuid16ToBeBytes(uuid: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16BE(uuid);
  return buf;
}

/**
 * Builds the legacy advertisement for a beacon:
 *
 *   advertisement: flags + service data (0xFFE0) with the 20-byte
 *                  [16 user id ASCII][4 app id] payload
 *   scan response: complete local name "PREFIX user_id"
 *
 * The user id is the printable 16-hex-char part; the app id is 4 raw bytes
 * (APP_ID_ORIGINAL vs APP_ID_RETRANSLATED) appended to the service data.
 */
export function buildAdvertisementPayloads(
  userId: UserId,
  appId: Uint8Array = APP_ID_ORIGINAL,
  prefix: string = DEFAULT_NAME_PREFIX,
): AdvertisementPayloads {
  if (appId.length !== BEACON_APP_ID_BYTES) {
    throw new Error(
      `app id must be ${BEACON_APP_ID_BYTES} bytes, got ${appId.length}`,
    );
  }
  if (userId.length !== BEACON_USER_ID_BYTES) {
    throw new Error(
      `user id must be ${BEACON_USER_ID_BYTES} chars, got ${userId.length}`,
    );
  }

  const payload = Buffer.concat([Buffer.from(userId, "ascii"), appId]);
  const uuidBytes = uuid16ToBeBytes(0xffe0);

  const serviceDataLen = 1 + uuidBytes.length + payload.length;
  const advertisementData = Buffer.concat([
    Buffer.from([0x02, 0x01, 0x06]),
    Buffer.from([serviceDataLen, 0x16]),
    uuidBytes,
    payload,
  ]);
  if (advertisementData.length > 31) {
    throw new Error(
      `advertisement data too long: ${advertisementData.length} > 31 bytes`,
    );
  }

  const fullName = `${prefix} ${userId}`.trim();
  const maxNameBytes = 31 - 2;
  const nameBytes = Buffer.from(fullName, "ascii").subarray(0, maxNameBytes);
  const scanResponse = Buffer.concat([
    Buffer.from([nameBytes.length + 1, 0x09]),
    nameBytes,
  ]);

  return {
    advertisementData,
    scanResponse,
    localName: nameBytes.toString("ascii"),
  };
}

/** Raw 20-byte wire payload: [16 user id ASCII][4 app id]. */
export function concatBeaconPayload(userId: UserId, appId: Uint8Array): Buffer {
  if (userId.length !== BEACON_USER_ID_BYTES || appId.length !== BEACON_APP_ID_BYTES) {
    throw new Error("beacon parts must be 16 user chars + 4 app bytes");
  }
  return Buffer.concat([Buffer.from(userId, "ascii"), appId]);
}

/** Extracts {userId, appId} from raw beacon service-data bytes. */export function parseBeaconPayload(bytes: Buffer): {
  userId: UserId;
  appId: Uint8Array;
} {
  return {
    userId: bytes.subarray(0, BEACON_USER_ID_BYTES).toString("ascii"),
    appId: Uint8Array.from(
      bytes.subarray(BEACON_USER_ID_BYTES, BEACON_APP_ID_BYTES + BEACON_USER_ID_BYTES),
    ),
  };
}

/** Human-readable view of a beacon for logs ("1A2B… / b1e4d1a0"). */
export function formatBeacon(
  userId: UserId,
  appId: Uint8Array,
  serviceUuid: string = BEACON_SERVICE_UUID,
): string {
  return `${userId} app=${Buffer.from(appId).toString("hex")} svc=${serviceUuid}`;
}
