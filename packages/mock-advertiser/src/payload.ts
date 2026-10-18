import { WRAPPER_SERVICE_UUID, type UserId } from "@ble-id/shared-types";

export const DEFAULT_NAME_PREFIX = "BLE-ID";

export interface AdvertisementPayloads {
  advertisementData: Buffer;
  scanResponse: Buffer;
  localName: string;
}

function uuidToLeBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, "");
  if (hex.length !== 32) {
    throw new Error(`not a 128-bit UUID: ${uuid}`);
  }
  return Buffer.from(hex, "hex").reverse();
}

export function buildAdvertisementPayloads(
  id: UserId,
  prefix: string = DEFAULT_NAME_PREFIX,
): AdvertisementPayloads {
  const idBytes = Buffer.from(id, "ascii");
  const uuidBytes = uuidToLeBytes(WRAPPER_SERVICE_UUID);

  const serviceDataLen = 1 + uuidBytes.length + idBytes.length;
  const advertisementData = Buffer.concat([
    Buffer.from([0x02, 0x01, 0x06]),
    Buffer.from([serviceDataLen, 0x16]),
    uuidBytes,
    idBytes,
  ]);
  if (advertisementData.length > 31) {
    throw new Error(
      `advertisement data too long: ${advertisementData.length} > 31 bytes`,
    );
  }

  const fullName = `${prefix} ${id}`.trim();
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
