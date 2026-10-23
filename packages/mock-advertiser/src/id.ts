import { createHash, randomBytes } from "node:crypto";
import { USER_ID_LENGTH, type UserId } from "@ble-id/shared-types";

/** Unambiguous uppercase charset (no I, O, 0, 1) in the style of "AB3F2K". */
export const ID_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Advertised ID is a sha256 prefix over fresh random bytes. The legacy
 * 31-byte packet leaves exactly 10 ASCII bytes for the service-data slot
 * (31 - flags 3 - AD header 2 - 128-bit UUID 16).
 */
export const HASH_ID_LENGTH = 10;

export function randomHashId(seed: Buffer = randomBytes(16)): UserId {
  const hash = createHash("sha256").update(seed).digest("hex");
  return hash.slice(0, HASH_ID_LENGTH).toUpperCase();
}

export function randomId(): UserId {
  const bytes = randomBytes(USER_ID_LENGTH);
  let out = "";
  for (const byte of bytes) out += ID_CHARSET[byte % ID_CHARSET.length];
  return out;
}

export function isValidMockId(id: string): boolean {
  if (id.length === HASH_ID_LENGTH) {
    return /^[0-9a-fA-F]+$/.test(id);
  }
  return (
    id.length === USER_ID_LENGTH &&
    [...id].every((c) => ID_CHARSET.includes(c))
  );
}
