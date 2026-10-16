/**
 * Identity: reads or creates a userId + one-shot token, stored in localStorage.
 *
 * The token is what proves "this user is allowed to claim exchange code X" —
 * start by having the native wrapper hand out a code (via QR/share), and the
 * web client pairs its claim to that code with its own token.
 */
const KEY = "ble-id-identity";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/1/O/0 — readable aloud
const USER_ID_LENGTH = 6;

export interface Identity {
  userId: string;
  token: string;
}

export function getOrCreateIdentity(): Identity {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;

  if (stored) {
    const parsed = JSON.parse(stored) as Identity;
    if (parsed.userId && parsed.token) return parsed;
  }

  const fresh = generateIdentity();
  localStorage.setItem(KEY, JSON.stringify(fresh));
  return fresh;
}

export function generateIdentity(): Identity {
  const userId = randomFromAlphabet(USER_ID_LENGTH);
  return { userId, token: generateToken() };
}

function randomFromAlphabet(length: number): string {
  const rnd = new Uint32Array(length);
  crypto.getRandomValues(rnd);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[rnd[i] % ALPHABET.length];
  }
  return out;
}

function generateToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return "t" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
