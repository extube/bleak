import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { CLAIM_TTL_MS, USER_FIELD_LIMITS } from "@ble-id/shared-types";

export interface IdClaimRow {
  user_id: string;
  exchange_code: string;
  token_hash: string;
  created_at: number;
  expires_at: number;
}

export interface UserRow {
  user_id: string;
  room_id: string | null;
  public_bio: string;
  private_bio: string;
  meta: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface RoomRow {
  room_id: string;
  name: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

/** Same 30-char alphabet as user IDs — unambiguous for humans. */
const ROOM_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateRoomId(): string {
  const bytes = randomBytes(6);
  let id = "";
  for (let i = 0; i < 6; i++) id += ROOM_ID_ALPHABET[bytes[i] % ROOM_ID_ALPHABET.length];
  return id;
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
      CREATE TABLE IF NOT EXISTS users (
        user_id      TEXT PRIMARY KEY,
        room_id      TEXT,
        public_bio   TEXT NOT NULL DEFAULT '',
        private_bio  TEXT NOT NULL DEFAULT '',
        meta         TEXT NOT NULL DEFAULT '',
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL,
        deleted_at   INTEGER
      );
      CREATE TABLE IF NOT EXISTS rooms (
        room_id      TEXT PRIMARY KEY,
        name         TEXT NOT NULL DEFAULT '',
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL,
        deleted_at   INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_users_room ON users(room_id);
    `);
    // Legacy DBs created before rooms existed — add the nullable room_id column.
    const usersCols = this.db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    if (!usersCols.some((col) => col.name === "room_id")) {
      this.db.exec("ALTER TABLE users ADD COLUMN room_id TEXT");
    }
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

  // -- Rooms ---------------------------------------------------------------

  createRoom(input: { roomId?: string; name?: string; now?: number }):
    | { roomId: string }
    | "exists" {
    const now = input.now ?? Date.now();
    const roomId = input.roomId ?? generateRoomId();
    try {
      this.db
        .prepare(
          "INSERT INTO rooms (room_id, name, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL)",
        )
        .run(roomId, (input.name ?? "").slice(0, 128), now, now);
      return { roomId };
    } catch {
      return "exists";
    }
  }

  updateRoom(roomId: string, patch: { name?: string }, now = Date.now()): "updated" | "not-found" | "already-deleted" {
    const row = this.roomById(roomId, true);
    if (!row) return "not-found";
    if (row.deleted_at !== null) return "already-deleted";
    if (patch.name !== undefined) {
      this.db
        .prepare("UPDATE rooms SET name = ?, updated_at = ? WHERE room_id = ?")
        .run(patch.name.slice(0, 128), now, roomId);
    }
    return "updated";
  }

  /** Tombstones the room; member users survive but become unreachable by API. */
  softDeleteRoom(roomId: string, now = Date.now()): "deleted" | "not-found" | "already-deleted" {
    const row = this.roomById(roomId, false);
    if (!row) return this.roomById(roomId, true) ? "already-deleted" : "not-found";
    this.db
      .prepare("UPDATE rooms SET deleted_at = ?, updated_at = ? WHERE room_id = ?")
      .run(now, now, roomId);
    return "deleted";
  }

  roomById(roomId: string, includeDeleted = false): RoomRow | undefined {
    const row = this.db
      .prepare("SELECT * FROM rooms WHERE room_id = ?")
      .get(roomId) as RoomRow | undefined;
    if (!row) return undefined;
    if (row.deleted_at !== null && !includeDeleted) return undefined;
    return row;
  }

  // -- Users (room-scoped) ---------------------------------------------------

  createUser(input: {
    roomId: string;
    userId: string;
    publicBio?: string;
    privateBio?: string;
    meta?: string;
    now?: number;
  }): "created" | "room-not-found" | "room-already-deleted" | "user-exists" {
    if (!this.roomById(input.roomId)) return "room-not-found";
    const now = input.now ?? Date.now();
    const clamp = (text: string | undefined, max: number) =>
      (text ?? "").slice(0, max);

    try {
      this.db
        .prepare(
          "INSERT INTO users (user_id, room_id, public_bio, private_bio, meta, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
        )
        .run(
          input.userId,
          input.roomId,
          clamp(input.publicBio, USER_FIELD_LIMITS.publicBio),
          clamp(input.privateBio, USER_FIELD_LIMITS.privateBio),
          clamp(input.meta, USER_FIELD_LIMITS.meta),
          now,
          now,
        );
      return "created";
    } catch {
      // PRIMARY KEY conflict — the caller decides the HTTP status.
      return "user-exists";
    }
  }

  updateUser(
    roomId: string,
    userId: string,
    patch: { publicBio?: string; privateBio?: string; meta?: string },
    now = Date.now(),
  ): "updated" | "room-not-found" | "user-not-found" | "already-deleted" {
    const row = this.userById(userId, true);
    if (!row || row.room_id !== roomId) return "user-not-found";
    if (row.deleted_at !== null) return "already-deleted";
    if (patch.publicBio === undefined && patch.privateBio === undefined && patch.meta === undefined) {
      return "updated";
    }

    if (patch.publicBio !== undefined)
      this.setField(userId, "public_bio", patch.publicBio, USER_FIELD_LIMITS.publicBio, now);
    if (patch.privateBio !== undefined)
      this.setField(userId, "private_bio", patch.privateBio, USER_FIELD_LIMITS.privateBio, now);
    if (patch.meta !== undefined)
      this.setField(userId, "meta", patch.meta, USER_FIELD_LIMITS.meta, now);

    return "updated";
  }

  /** Tombstones the user row — profile is gone, history preserved. */
  softDeleteUser(
    roomId: string,
    userId: string,
    now = Date.now(),
  ): "deleted" | "room-not-found" | "user-not-found" | "already-deleted" {
    if (!this.roomById(roomId, true)) return "room-not-found";
    const row = this.userById(userId, false);
    if (!row) {
      const tombstoned = this.userById(userId, true);
      return tombstoned && tombstoned.room_id === roomId ? "already-deleted" : "user-not-found";
    }
    this.db
      .prepare("UPDATE users SET deleted_at = ?, updated_at = ? WHERE user_id = ?")
      .run(now, now, userId);
    return "deleted";
  }

  /** Wipes the user row outright — including any tombstone. No undo. */
  forceDeleteUser(roomId: string, userId: string): "deleted" | "room-not-found" | "user-not-found" {
    if (!this.roomById(roomId, true)) return "room-not-found";
    const row = this.userById(userId, true);
    if (!row || row.room_id !== roomId) return "user-not-found";
    this.db.prepare("DELETE FROM users WHERE user_id = ?").run(userId);
    return "deleted";
  }

  /**
   * Copy a user into another room under a fresh id — every field carried over
   * except the identity itself. The source user stays untouched (copy, not move).
   */
  migrateUser(
    fromRoomId: string,
    userId: string,
    to: { roomId: string; userId: string },
    now = Date.now(),
  ):
    | "migrated"
    | "from-room-not-found"
    | "to-room-not-found"
    | "user-not-found"
    | "user-already-deleted"
    | "target-id-exists" {
    if (!this.roomById(fromRoomId, true)) return "from-room-not-found";
    if (!this.roomById(to.roomId)) return "to-room-not-found";

    const source = this.userById(userId, true);
    if (!source || source.room_id !== fromRoomId) return "user-not-found";
    if (source.deleted_at !== null) return "user-already-deleted";

    try {
      this.db
        .prepare(
          "INSERT INTO users (user_id, room_id, public_bio, private_bio, meta, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
        )
        .run(to.userId, to.roomId, source.public_bio, source.private_bio, source.meta, now, now);
    } catch {
      return "target-id-exists";
    }
    return "migrated";
  }

  userById(userId: string, includeDeleted = false): UserRow | undefined {
    const row = this.db
      .prepare("SELECT * FROM users WHERE user_id = ?")
      .get(userId) as UserRow | undefined;
    if (!row) return undefined;
    if (row.deleted_at !== null && !includeDeleted) return undefined;
    return row;
  }

  private setField(
    userId: string,
    column: string,
    value: string,
    max: number,
    now: number,
  ): void {
    this.db
      .prepare(`UPDATE users SET ${column} = ?, updated_at = ? WHERE user_id = ?`)
      .run(value.slice(0, max), now, userId);
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
