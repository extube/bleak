import { randomBytes } from "node:crypto";
import { USER_ID_LENGTH, type UserId } from "@ble-id/shared-types";

/** Unambiguous uppercase charset (no I, O, 0, 1) in the style of "AB3F2K". */
export const ID_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomId(): UserId {
  const bytes = randomBytes(USER_ID_LENGTH);
  let out = "";
  for (const byte of bytes) out += ID_CHARSET[byte % ID_CHARSET.length];
  return out;
}

export function isValidMockId(id: string): boolean {
  return (
    id.length === USER_ID_LENGTH &&
    [...id].every((c) => ID_CHARSET.includes(c))
  );
}
