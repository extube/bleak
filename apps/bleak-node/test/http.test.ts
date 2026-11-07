import { strict as assert } from "node:assert";
import { test, beforeEach, afterEach } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { buildServer } from "../src/main.js";
import { ClaimStore, type RoomRow } from "../src/store.js";
import { ROOM_FIELD_LIMITS, USER_FIELD_LIMITS } from "@ble-id/shared-types";

let dir: string;
let store: ClaimStore;
let app: ReturnType<typeof Fastify>;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "bleid-http-"));
  store = new ClaimStore(path.join(dir, "test.db"));
  app = buildServer({ port: 0 }, store); // port 0 — inject() never opens a socket
});

afterEach(async () => {
  await app.close();
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

const ROOM_ROUTE = (id: string) => `/api/room/${id}`;
const USER_ROUTE = (room: string, user: string) => `/api/room/${room}/users/${user}`;

// -- Rooms -------------------------------------------------------------------

test("room CRUD via REST", async () => {
  const created = await app.inject({
    method: "POST",
    url: "/api/room",
    payload: { roomId: "R1", name: "lobby" },
  });
  assert.equal(created.statusCode, 201);
  assert.deepEqual(created.json(), {
    roomId: "R1", name: "lobby",
    createdAt: created.json().createdAt, updatedAt: created.json().updatedAt,
  } satisfies Partial<RoomRow>);

  assert.equal(
    (await app.inject({ method: "POST", url: "/api/room", payload: { roomId: "R1" } })).statusCode,
    409,
  );
  assert.equal(
    (await app.inject({ method: "PATCH", url: ROOM_ROUTE("R1"), payload: { name: "new" } })).statusCode,
    200,
  );
  assert.equal((await app.inject({ url: ROOM_ROUTE("R1") })).statusCode, 200);
  assert.equal((await app.inject({ url: ROOM_ROUTE("NOPE") })).statusCode, 404);
  assert.equal((await app.inject({ method: "DELETE", url: ROOM_ROUTE("R1") })).statusCode, 204);
  assert.equal((await app.inject({ url: ROOM_ROUTE("R1") })).statusCode, 404);
  assert.equal((await app.inject({ method: "DELETE", url: ROOM_ROUTE("R1") })).statusCode, 410);
});

test("room name limit enforced at REST layer", async () => {
  await app.inject({ method: "POST", url: "/api/room", payload: { roomId: "R1" } });
  const tooLong = await app.inject({
    method: "PATCH",
    url: ROOM_ROUTE("R1"),
    payload: { name: "x".repeat(ROOM_FIELD_LIMITS.name + 1) },   // 65 chars
  });
  assert.equal(tooLong.statusCode, 400);
});

// -- Users -------------------------------------------------------------------

test("user CRUD via room-scoped REST", async () => {
  await app.inject({ method: "POST", url: "/api/room", payload: { roomId: "R1" } });
  await app.inject({ method: "POST", url: "/api/room", payload: { roomId: "R2" } });

  const create = await app.inject({
    method: "POST",
    url: "/api/room/R1/users",
    payload: { userId: "AB3F2K", name: "Alice", publicBio: "hi", privateBio: "s", meta: "m" },
  });
  assert.equal(create.statusCode, 201);
  assert.equal(create.json().name, "Alice");

  assert.equal(
    (await app.inject({
      method: "POST", url: "/api/room/R1/users", payload: { userId: "AB3F2K" },
    })).statusCode,
    409,
  );
  assert.equal(
    (await app.inject({ url: "/api/room/R9/users", payload: { userId: "QQQQ01" } })).statusCode,
    404,
  );
  assert.equal((await app.inject({ url: USER_ROUTE("R2", "AB3F2K") })).statusCode, 404);
  assert.equal(
    (await app.inject({
      method: "PATCH", url: USER_ROUTE("R1", "AB3F2K"), payload: { publicBio: "v2" },
    })).statusCode,
    200,
  );
  assert.equal((await app.inject({ url: USER_ROUTE("R1", "AB3F2K") })).json().publicBio, "v2");

  // soft then force delete
  assert.equal((await app.inject({ method: "DELETE", url: USER_ROUTE("R1", "AB3F2K") })).statusCode, 204);
  assert.equal((await app.inject({ url: USER_ROUTE("R1", "AB3F2K") })).statusCode, 404);
  assert.equal(
    (await app.inject({
      method: "PATCH", url: USER_ROUTE("R1", "AB3F2K"), payload: { publicBio: "x" },
    })).statusCode,
    410,
  );
  assert.equal(
    (await app.inject({ method: "DELETE", url: `${USER_ROUTE("R1", "AB3F2K")}/force` })).statusCode,
    204,
  );
  assert.equal(
    (await app.inject({ method: "DELETE", url: `${USER_ROUTE("R1", "AB3F2K")}/force` })).statusCode,
    404,
  );
});

test("oversize and wrong-type fields rejected at REST layer", async () => {
  await app.inject({ method: "POST", url: "/api/room", payload: { roomId: "R1" } });
  const base = { method: "POST" as const, url: "/api/room/R1/users" };

  const tooLongMeta = await app.inject({
    ...base,
    payload: { userId: "AB3F2K", meta: "m".repeat(USER_FIELD_LIMITS.meta + 1) },
  });
  assert.equal(tooLongMeta.statusCode, 400);

  const wrongType = await app.inject({
    ...base,
    payload: { userId: "AB3F2K", publicBio: 42 },
  });
  assert.equal(wrongType.statusCode, 400);
});

test("soft-deleted room makes every child route 410", async () => {
  await app.inject({ method: "POST", url: "/api/room", payload: { roomId: "R1" } });
  await app.inject({ method: "POST", url: "/api/room/R1/users", payload: { userId: "AB3F2K" } });
  await app.inject({ method: "DELETE", url: ROOM_ROUTE("R1") });

  assert.equal((await app.inject({ url: USER_ROUTE("R1", "AB3F2K") })).statusCode, 410);
  assert.equal(
    (await app.inject({ method: "PATCH", url: USER_ROUTE("R1", "AB3F2K"), payload: {} })).statusCode,
    410,
  );
  assert.equal((await app.inject({ method: "DELETE", url: USER_ROUTE("R1", "AB3F2K") })).statusCode, 410);
  assert.equal(
    (await app.inject({ method: "DELETE", url: `${USER_ROUTE("R1", "AB3F2K")}/force` })).statusCode,
    410,
  );
  assert.equal(
    (await app.inject({
      method: "POST",
      url: "/api/room/R1/users",
      payload: { userId: "NEWB01" },
    })).statusCode,
    410,
  );
});

// -- Migration ----------------------------------------------------------------

test("migration endpoint copies profile to target room", async () => {
  await app.inject({ method: "POST", url: "/api/room", payload: { roomId: "R1" } });
  await app.inject({ method: "POST", url: "/api/room", payload: { roomId: "R2" } });
  await app.inject({
    method: "POST", url: "/api/room/R1/users",
    payload: { userId: "AB3F2K", name: "Alice", publicBio: "pub", meta: "m" },
  });

  const ok = await app.inject({
    method: "POST",
    url: "/api/room/R1/users/AB3F2K/migrate",
    payload: { roomId: "R2", userId: "NEWW01" },
  });
  assert.equal(ok.statusCode, 201);
  assert.equal(ok.json().name, "Alice");
  assert.equal(ok.json().room_id, undefined); // wire format is UserProfile, not raw row

  const migrated = await app.inject({ url: USER_ROUTE("R2", "NEWW01") });
  assert.equal(migrated.statusCode, 200);
  assert.equal(migrated.json().publicBio, "pub");

  // source intact
  assert.equal((await app.inject({ url: USER_ROUTE("R1", "AB3F2K") })).statusCode, 200);
});

test("migration endpoint validation", async () => {
  await app.inject({ method: "POST", url: "/api/room", payload: { roomId: "R1" } });
  await app.inject({ method: "POST", url: "/api/room", payload: { roomId: "R2" } });
  await app.inject({ method: "POST", url: "/api/room/R1/users", payload: { userId: "AB3F2K" } });

  const cases: Array<[string, unknown, number]> = [
    ["same room", { roomId: "R1", userId: "T1" }, 400],
    ["unknown target room", { roomId: "R9", userId: "T1" }, 404],
    ["missing target userId", { roomId: "R2" }, 400],
    ["wrong target type", { roomId: "R2", userId: 123 }, 400],
  ];
  for (const [name, payload, expected] of cases) {
    const res = await app.inject({
      method: "POST", url: "/api/room/R1/users/AB3F2K/migrate", payload,
    });
    assert.equal(res.statusCode, expected, name);
  }

  // duplicate target id → 409
  await app.inject({
    method: "POST", url: "/api/room/R1/users/AB3F2K/migrate",
    payload: { roomId: "R2", userId: "T1" },
  });
  const dup = await app.inject({
    method: "POST", url: "/api/room/R1/users/AB3F2K/migrate",
    payload: { roomId: "R2", userId: "T1" },
  });
  assert.equal(dup.statusCode, 409);

  // source room soft-deleted → 410
  await app.inject({ method: "DELETE", url: ROOM_ROUTE("R1") });
  const dead = await app.inject({
    method: "POST", url: "/api/room/R1/users/AB3F2K/migrate",
    payload: { roomId: "R2", userId: "T2" },
  });
  assert.equal(dead.statusCode, 410);
});
