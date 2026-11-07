import { strict as assert } from "node:assert";
import { test, beforeEach, afterEach } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ClaimStore } from "../src/store.js";
import { USER_FIELD_LIMITS } from "@ble-id/shared-types";

let dir: string;
let store: ClaimStore;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "bleid-test-"));
  store = new ClaimStore(path.join(dir, "test.db"));
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

// -- Rooms -------------------------------------------------------------------

test("room create with explicit and auto ids", () => {
  assert.deepEqual(store.createRoom({ roomId: "R1", name: "lobby" }), { roomId: "R1" });
  const auto = store.createRoom({ name: "auto" });
  assert.equal(auto !== "exists", true);
  assert.deepEqual(store.createRoom({ roomId: "R1" }), "exists");
  const autoDeleted = auto as { roomId: string };
  assert.equal(store.roomById(autoDeleted.roomId)?.name, "auto");
});

test("room name clamped to 64 chars", () => {
  store.createRoom({ roomId: "R1", name: "x".repeat(100) });
  assert.equal(store.roomById("R1")!.name.length, 64);
});

test("room get / update / soft-delete lifecycle", () => {
  store.createRoom({ roomId: "R1", name: "old" });
  assert.equal(store.updateRoom("R1", { name: "new" }), "updated");
  assert.equal(store.roomById("R1")!.name, "new");
  assert.equal(store.updateRoom("NOPE", { name: "x" }), "not-found");

  assert.equal(store.softDeleteRoom("R1"), "deleted");
  assert.equal(store.roomById("R1"), undefined);            // hidden when active-only
  assert.equal(store.roomById("R1", true)?.deleted_at !== null, true);
  assert.equal(store.updateRoom("R1", { name: "x" }), "already-deleted");
  assert.equal(store.softDeleteRoom("R1"), "already-deleted");
  assert.equal(store.softDeleteRoom("NOPE"), "not-found");
});

// -- Users -------------------------------------------------------------------

test("user create requires an existing room", () => {
  store.createRoom({ roomId: "R1" });
  assert.equal(
    store.createUser({ roomId: "R9", userId: "AB3F2K" }),
    "room-not-found",
  );
  assert.equal(store.createUser({ roomId: "R1", userId: "AB3F2K" }), "created");
  assert.equal(store.createUser({ roomId: "R1", userId: "AB3F2K" }), "user-exists");
});

test("user text fields clamped to limits", () => {
  store.createRoom({ roomId: "R1" });
  store.createUser({
    roomId: "R1",
    userId: "AB3F2K",
    name: "n".repeat(77),
    publicBio: "p".repeat(200),
    privateBio: "s".repeat(200),
    meta: "m".repeat(300),
  });
  const row = store.userById("AB3F2K")!;
  assert.equal(row.name.length, USER_FIELD_LIMITS.name);
  assert.equal(row.public_bio.length, USER_FIELD_LIMITS.publicBio);
  assert.equal(row.private_bio.length, USER_FIELD_LIMITS.privateBio);
  assert.equal(row.meta.length, USER_FIELD_LIMITS.meta);
});

test("user CRUD through room scope", () => {
  store.createRoom({ roomId: "R1", name: "a" });
  store.createRoom({ roomId: "R2", name: "b" });
  store.createUser({ roomId: "R1", userId: "AB3F2K", publicBio: "v1" });

  assert.equal(store.userById("AB3F2K")!.room_id, "R1");
  assert.equal(store.updateUser("R2", "AB3F2K", { publicBio: "x" }), "user-not-found");
  assert.equal(store.updateUser("R1", "AB3F2K", { publicBio: "v2", name: "Alice" }), "updated");
  assert.equal(store.userById("AB3F2K")!.public_bio, "v2");
  assert.equal(store.updateUser("R1", "AB3F2K", {}), "updated"); // no-op patch

  assert.equal(store.softDeleteUser("R2", "AB3F2K"), "user-not-found");
  assert.equal(store.softDeleteUser("R1", "AB3F2K"), "deleted");
  assert.equal(store.userById("AB3F2K"), undefined);
  assert.equal(store.updateUser("R1", "AB3F2K", { publicBio: "x" }), "already-deleted");
  assert.equal(store.softDeleteUser("R1", "AB3F2K"), "already-deleted");

  assert.equal(store.forceDeleteUser("R1", "AB3F2K"), "deleted");
  assert.equal(store.userById("AB3F2K", true), undefined);
  assert.equal(store.forceDeleteUser("R1", "AB3F2K"), "user-not-found");
});

// -- Migration ---------------------------------------------------------------

test("migration copies all fields except identity", () => {
  store.createRoom({ roomId: "R1", name: "from" });
  store.createRoom({ roomId: "R2", name: "to" });
  store.createUser({
    roomId: "R1",
    userId: "AB3F2K",
    name: "Alice",
    publicBio: "pub",
    privateBio: "priv",
    meta: "meta-data",
  });

  const result = store.migrateUser("R1", "AB3F2K", { roomId: "R2", userId: "NEWW01" });
  assert.equal(result, "migrated");

  const src = store.userById("AB3F2K", true)!;
  const dst = store.userById("NEWW01")!;
  assert.equal(dst.room_id, "R2");
  assert.equal(dst.name, "Alice");
  assert.equal(dst.public_bio, "pub");
  assert.equal(dst.private_bio, "priv");
  assert.equal(dst.meta, "meta-data");
  // source untouched, still in R1
  assert.equal(src.room_id, "R1");
  assert.equal(src.public_bio, "pub");
});

test("migration failure paths", () => {
  store.createRoom({ roomId: "R1" });
  store.createRoom({ roomId: "R2" });
  store.createUser({ roomId: "R1", userId: "AB3F2K", publicBio: "x" });

  assert.equal(
    store.migrateUser("R1", "AB3F2K", { roomId: "R9", userId: "T1" }),
    "to-room-not-found",
  );
  assert.equal(
    store.migrateUser("R9", "AB3F2K", { roomId: "R2", userId: "T1" }),
    "from-room-not-found",
  );
  assert.equal(
    store.migrateUser("R1", "MISSING", { roomId: "R2", userId: "T1" }),
    "user-not-found",
  );
  assert.equal(
    store.migrateUser("R1", "AB3F2K", { roomId: "R2", userId: "T1" }),
    "migrated",
  );
  // target id now taken
  assert.equal(
    store.migrateUser("R1", "AB3F2K", { roomId: "R2", userId: "T1" }),
    "target-id-exists",
  );

  // soft-deleted source cannot migrate
  store.createUser({ roomId: "R1", userId: "DELA01" });
  store.softDeleteUser("R1", "DELA01");
  assert.equal(
    store.migrateUser("R1", "DELA01", { roomId: "R2", userId: "T2" }),
    "user-already-deleted",
  );
});

// -- Different data insertion ------------------------------------------------

test("unicode and whitespace survive round-trip", () => {
  store.createRoom({ roomId: "R1", name: "Комната ①" });
  store.createUser({
    roomId: "R1",
    userId: "AB3F2K",
    name: "  spaced name  ",
    publicBio: "héllo 世界 🎁",
    privateBio: "tab\tnewline\nname",
    meta: "мetadata",
  });
  const row = store.userById("AB3F2K")!;
  assert.equal(row.name, "  spaced name  ");      // stored as-is, client decides trimming
  assert.equal(row.public_bio, "héllo 世界 🎁");
  assert.equal(row.private_bio, "tab\tnewline\nname");
});

test("empty-string fields insert as empty", () => {
  store.createRoom({ roomId: "R1", name: "" });
  store.createUser({ roomId: "R1", userId: "AB3F2K", name: "", publicBio: "", privateBio: "", meta: "" });
  const row = store.userById("AB3F2K")!;
  assert.equal(row.name, "");
  assert.equal(row.public_bio, "");
  assert.equal(row.private_bio, "");
  assert.equal(row.meta, "");
  assert.equal(store.roomById("R1")!.name, "");
});

test("exact-limit field accepted, limit+1 clamped", () => {
  store.createRoom({ roomId: "R1" });
  const exactPublic = "p".repeat(USER_FIELD_LIMITS.publicBio);
  const exactMeta = "m".repeat(USER_FIELD_LIMITS.meta);
  store.createUser({
    roomId: "R1",
    userId: "AB3F2K",
    name: "n".repeat(USER_FIELD_LIMITS.name),
    publicBio: exactPublic,
    meta: exactMeta,
  });
  const row = store.userById("AB3F2K")!;
  assert.equal(row.public_bio, exactPublic);            // boundary kept verbatim
  assert.equal(row.meta, exactMeta);
  assert.equal(row.name.length, USER_FIELD_LIMITS.name);
  store.updateUser("R1", "AB3F2K", { meta: "z".repeat(USER_FIELD_LIMITS.meta + 1) });
  assert.equal(store.userById("AB3F2K")!.meta.length, USER_FIELD_LIMITS.meta);
});

test("soft-deleted user rows persist on disk (tombstone readable)", () => {
  store.createRoom({ roomId: "R1" });
  store.createUser({ roomId: "R1", userId: "AB3F2K", name: "Alice", privateBio: "kept" });
  store.softDeleteUser("R1", "AB3F2K");
  const tombstone = store.userById("AB3F2K", true)!;
  assert.equal(tombstone.deleted_at !== null, true);
  assert.equal(tombstone.private_bio, "kept");
});
