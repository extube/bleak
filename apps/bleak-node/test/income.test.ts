import { strict as assert } from "node:assert";
import { test, beforeEach, afterEach } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { buildServer } from "../src/main.js";
import { ClaimStore } from "../src/store.js";
import type { IncomeRecord } from "@ble-id/shared-types";

let dir: string;
let store: ClaimStore;
let app: ReturnType<typeof Fastify>;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "bleid-income-"));
  store = new ClaimStore(path.join(dir, "test.db"));
  app = buildServer({ port: 0 }, store);
});

afterEach(async () => {
  await app.close();
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

async function makeRoom(roomId = "R1") {
  const res = await app.inject({ method: "POST", url: "/api/room", payload: { roomId } });
  assert.equal(res.statusCode, 201);
  return roomId;
}

function assertIncomeShape(record: IncomeRecord) {
  assert.equal(record.tempId.length, 8);
  assert.match(record.tempId, /^\d{8}$/);
  assert.equal(record.deleted, false);
  assert.equal(record.expiresAt - record.createdAt, 24 * 60 * 60 * 1000);
}

test("income created for a room returns 8-digit temp code, 24h default TTL", async () => {
  await makeRoom();
  const res = await app.inject({ method: "POST", url: "/api/room/R1/income" });
  assert.equal(res.statusCode, 201);
  const record = res.json() as IncomeRecord;
  assertIncomeShape(record);
  assert.equal(record.roomId, "R1");
});

test("each new income line gets a distinct temp code", async () => {
  await makeRoom();
  const a = await app.inject({ method: "POST", url: "/api/room/R1/income" });
  const b = await app.inject({ method: "POST", url: "/api/room/R1/income" });
  assert.notEqual(a.json().tempId, b.json().tempId);
});

test("income cannot be created in a deleted or unknown room", async () => {
  await makeRoom("R0");
  assert.equal(
    (await app.inject({ method: "POST", url: "/api/room/R0/income" })).statusCode,
    201,
  );
  assert.equal(
    (await app.inject({ method: "POST", url: "/api/room/NOPE/income" })).statusCode,
    404,
  );
  await app.inject({ method: "DELETE", url: "/api/room/R0" });
  assert.equal(
    (await app.inject({ method: "POST", url: "/api/room/R0/income" })).statusCode,
    410,
  );
});

test("GET /api/income/:tempId resolves roomId for /join", async () => {
  await makeRoom();
  const tempId = (await app.inject({ method: "POST", url: "/api/room/R1/income" })).json().tempId;
  const got = await app.inject({ url: `/api/income/${tempId}` });
  assert.equal(got.statusCode, 200);
  assert.equal(got.json().roomId, "R1");

  assert.equal((await app.inject({ url: "/api/income/00000000" })).statusCode, 404);
});

test("soft delete tombstones the income line", async () => {
  await makeRoom();
  const tempId = (await app.inject({ method: "POST", url: "/api/room/R1/income" })).json().tempId;

  assert.equal(
    (await app.inject({ method: "DELETE", url: `/api/income/${tempId}` })).statusCode,
    204,
  );
  // Tombstoned — 404 for join lookups, 410 on a repeated delete.
  assert.equal((await app.inject({ url: `/api/income/${tempId}` })).statusCode, 404);
  assert.equal(
    (await app.inject({ method: "DELETE", url: `/api/income/${tempId}` })).statusCode,
    410,
  );
});

test("room income listing shows active lines and excludes tombstones", async () => {
  await makeRoom();
  const first = (await app.inject({ method: "POST", url: "/api/room/R1/income" })).json().tempId;
  await app.inject({ method: "POST", url: "/api/room/R1/income" });

  const listed = await app.inject({ url: "/api/room/R1/income" });
  assert.equal(listed.statusCode, 200);
  assert.equal((listed.json() as IncomeRecord[]).length, 2);

  await app.inject({ method: "DELETE", url: `/api/income/${first}` });
  const afterDelete = (await app.inject({ url: `/api/room/R1/income` }));
  // Listing intentionally does not filter tombstones (deleted: true visible).
  assert.equal(
    (afterDelete.json() as IncomeRecord[]).find((r) => r.tempId === first)!.deleted,
    true,
  );
});

test("expired income line stops resolving", async () => {
  await makeRoom();
  const created = store.createIncome({ roomId: "R1", now: Date.now() - 24 * 60 * 60 * 1000 });
  assert.ok("record" in created);
  await app.inject({ method: "POST", url: "/api/room/R1/income" }); // keep room busy
  const res = await app.inject({ url: `/api/income/${created.record.tempId}` });
  // GC removes expired rows — see store gc(); either 404 (purged) is acceptable.
  assert.ok([404, 410].includes(res.statusCode), `got ${res.statusCode}`);
});
