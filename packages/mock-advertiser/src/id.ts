import { createHash, randomBytes } from "node:crypto";
import {
  BEACON_USER_ID_BYTES,
  USER_ID_LENGTH,
  type UserId,
} from "@ble-id/shared-types";

/** Unambiguous uppercase charset (no I, O, 0, 1) in the style of "AB3F2K". */
export const ID_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomId(): UserId {
  const bytes = randomBytes(USER_ID_LENGTH);
  let out = "";
  for (const byte of bytes) out += ID_CHARSET[byte % ID_CHARSET.length];
  return out;
}

/**
 * Beacon user id: first 16 hex chars of the sha256 digest over fresh random
 * bytes (uppercase). Rotations generate a new seed; the 4 app-id bytes are
 * appended at the wire format layer (payload.ts), not here.
 */
export function randomBeaconUserId(seed: Buffer = randomBytes(16)): UserId {
  return createHash("sha256")
    .update(seed)
    .digest("hex")
    .slice(0, BEACON_USER_ID_BYTES)
    .toUpperCase();
}

export function isValidBeaconUserId(id: string): boolean {
  return id.length === BEACON_USER_ID_BYTES && /^[0-9a-fA-F]+$/.test(id);
}

export function isValidMockId(id: string): boolean {
  if (isValidBeaconUserId(id)) return true;
  return (
    id.length === USER_ID_LENGTH &&
    [...id].every((c) => ID_CHARSET.includes(c))
  );
}
