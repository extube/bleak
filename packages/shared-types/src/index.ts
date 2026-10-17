// ---------------------------------------------------------------------------
// Identity: a short, human-shareable ID (e.g. "AB3F2K") plus a challenge token
// proving ownership. Tokens are one-shot: claiming an exchange code burns them.
// ---------------------------------------------------------------------------

/** Short ID shown to users, e.g. "AB3F2K". */
export type UserId = string;

/** One-time challenge token, e.g. "c1f4…". Generated per session in URL fragment. */
export type ClaimToken = string;

/** An exchange code published by a native wrapper (shown as QR/code on screen). */
export type ExchangeCode = string;

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

export interface IdClaim {
  userId: UserId;
  token: ClaimToken;
  exchangeCode: ExchangeCode;
  createdAt: number;
  /** Ads that only succeed while the wrapper advertises this code live. */
  expiresAt: number;
}

export interface ClaimRequest {
  userId: UserId;
  token: ClaimToken;
  exchangeCode: ExchangeCode;
}

export type ClaimResult =
  | { ok: true; claim: IdClaim }
  | { ok: false; reason: ClaimRejectionReason };

export type ClaimRejectionReason =
  | "invalid-token"
  | "token-burned"
  | "unknown-exchange-code"
  | "code-expired"
  | "code-already-claimed";

// ---------------------------------------------------------------------------
// User profile (server-managed record)
// ---------------------------------------------------------------------------

export interface UserProfile {
  userId: UserId;
  /** Shown to other users. */
  publicBio: string;
  /** Only meaningful to the owner — never broadcast over relay. */
  privateBio: string;
  /** Free-form blob the owner's devices can use for sync payloads. */
  meta: string;
  createdAt: number;
  updatedAt: number;
}

/** Max lengths enforced by the server for user profile text fields. */
export const USER_FIELD_LIMITS = {
  publicBio: 128,
  privateBio: 128,
  meta: 256,
} as const;

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

export interface RoomProfile {
  roomId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

/** Max lengths enforced by the server for room text fields. */
export const ROOM_FIELD_LIMITS = {
  name: 128,
  roomId: 32,
} as const;

// ---------------------------------------------------------------------------
// WebSocket envelope
// ---------------------------------------------------------------------------

/** Server → clients (relay broadcast) */
export type RelayEvent =
  | { type: "connected"; clientId: string }
  | { type: "claim-opened"; claim: IdClaim }
  | { type: "claim-closed"; userId: UserId; exchangeCode: ExchangeCode }
  | { type: "claim-result"; result: ClaimResult }
  | { type: "noop" };

/** Client → server */
export type ClientMessage =
  | { type: "watch"; exchangeCode?: ExchangeCode }
  | { type: "unwatch" }
  | { type: "claim"; body: ClaimRequest }
  | { type: "ping" };

// ---------------------------------------------------------------------------
// Direct BLE (Flow A — Android only)
// ---------------------------------------------------------------------------

/** Service UUID the native wrapper advertises so the web picker can filter it. */
export const WRAPPER_SERVICE_UUID = "B1E4D1A0-0F1E-46BA-8E29-9A4C1F7E0001";

/** Characteristic the web client writes its claim into (write-only). */
export const WRAPPER_CLAIM_CHAR_UUID =
  "B1E4D1A0-0F1E-46BA-8E29-9A4C1F7E0002";

/** Characteristic the wrapper exposes the active exchange code in (read-only). */
export const WRAPPER_EXCHANGE_CHAR_UUID =
  "B1E4D1A0-0F1E-46BA-8E29-9A4C1F7E0003";

/** How long a claim stays open before expiry (ms). */
export const CLAIM_TTL_MS = 10 * 60 * 1000;

/** Default ID length. */
export const USER_ID_LENGTH = 6;
