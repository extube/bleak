import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { CLAIM_TTL_MS } from "@ble-id/shared-types";

export interface IdClaimRow {
  user_id: string;
  exchange_code: string;
  token_hash: string;
  created_at: number;
  expires_at: number;
}

/**
 * SQLite store — Node's built-in `node:sqlite`, zero native deps, single file.
 * A claim row is created when a web client posts its ID for a code, and burned
 * when the matching native wrapper acks/expiry — one-time tokens.
 */
export class ClaimStore {
  private db: DatabaseSync;

  constructor(path = process.env.SQLITE_PATH ?? "claims.db") {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS exchanges (
        exchange_code TEXT PRIMARY KEY NOT NULL,
        created_at    INTEGER NOT NULL,
        expires_at    INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS claims (
        exchange_code TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL,
        token_hash    TEXT NOT NULL,
        created_at    INTEGER NOT NULL,
        expires_at    INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_claims_code ON claims(exchange_code);
    `);
    this.gc();
  }

  /**
   * The native wrapper announces "exchange code X is now live on my screen"/BLE
   * — whoever holds this code may claim an ID for a while.
   */
  activateExchange(exchangeCode: string, now = Date.now()): void {
    this.db
      .prepare(
        "INSERT INTO exchanges (exchange_code, created_at, expires_at) VALUES (?, ?, ?) ON CONFLICT(exchange_code) DO UPDATE SET expires_at = excluded.expires_at",
      )
      .run(exchangeCode, now, now + CLAIM_TTL_MS);
  }

  /** A claim is valid while the row exists and hasn't expired. */
  isClaimOpen(userId: string, exchangeCode: string): boolean {
    const row = this.db
      .prepare("SELECT * FROM claims WHERE user_id = ? AND exchange_code = ?")
      .get(userId, exchangeCode) as IdClaimRow | undefined;
    return !!row && row.expires_at > Date.now();
  }

  /**
   * One claim slot per exchange code:
   *  - free slot            → "created"
   *  - same user, same token → "same" (idempotent retry)
   *  - someone else's slot   → "taken"
   *  - expired slot          → evicted, "created"
   * The token never leaves the hash; openClaim stores it for later matching.
   */
  claimExchange(request: {
    userId: string;
    exchangeCode: string;
    token: string;
    now: number;
  }): "created" | "same" | "taken" {
    const existing = this.claimedByCode(request.exchangeCode);

    if (existing) {
      if (existing.expires_at <= request.now) {
        this.closeExchange(request.exchangeCode);
      } else if (existing.user_id === request.userId) {
        if (existing.token_hash === hashToken(request.token)) return "same";
        // same user but different token = stale session — burn and re-open
        this.closeExchange(request.exchangeCode);
      } else {
        return "taken";
      }
    }

    this.db
      .prepare(
        "INSERT INTO claims (exchange_code, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        request.exchangeCode,
        request.userId,
        hashToken(request.token),
        request.now,
        request.now + CLAIM_TTL_MS,
      );
    return "created";
  }

  /** Verify the claimed token is the exact token this row was opened with. */
  verifyClaimToken(userId: string, exchangeCode: string, token: string): boolean {
    const row = this.claimedByCode(exchangeCode);
    if (!row || row.expires_at <= Date.now() || row.user_id !== userId) return false;
    return row.token_hash === hashToken(token);
  }

  /** Slot holder for an exchange code, if claimed and unexpired. */
  claimedByCode(exchangeCode: string): IdClaimRow | undefined {
    const row = this.db
      .prepare("SELECT * FROM claims WHERE exchange_code = ? LIMIT 1")
      .get(exchangeCode) as IdClaimRow | undefined;
    if (!row || row.expires_at <= Date.now()) return undefined;
    return row;
  }

  listExchangeCodes(): string[] {
    const rows = this.db
      .prepare("SELECT exchange_code FROM exchanges WHERE expires_at > ?")
      .all(Date.now()) as Array<{ exchange_code: string }>;
    return [...new Set(rows.map((row) => row.exchange_code))];
  }

  closeExchange(exchangeCode: string): void {
    this.db.prepare("DELETE FROM exchanges WHERE exchange_code = ?").run(exchangeCode);
    this.db.prepare("DELETE FROM claims WHERE exchange_code = ?").run(exchangeCode);
  }

  userIdForExchange(exchangeCode: string): string | null {
    const row = this.db
      .prepare(
        "SELECT user_id FROM claims WHERE exchange_code = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(exchangeCode, Date.now()) as { user_id: string } | undefined;
    return row?.user_id ?? null;
  }

  private gc(): void {
    const now = Date.now();
    this.db.prepare("DELETE FROM claims WHERE expires_at <= ?").run(now);
    this.db.prepare("DELETE FROM exchanges WHERE expires_at <= ?").run(now);
  }

  close(): void {
    this.db.close();
  }
}

/** Tokens are stored hashed — SQLite is not the right place to hold secrets. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
