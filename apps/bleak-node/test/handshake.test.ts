import { strict as assert } from "node:assert";
import { test, beforeEach, afterEach } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { buildServer } from "../src/main.js";
import { ClaimStore } from "../src/store.js";

let dir: string;
let store: ClaimStore;
let app: ReturnType<typeof Fastify>;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "bleid-handshake-"));
  store = new ClaimStore(path.join(dir, "test.db"));
  app = buildServer({ port: 0 }, store);
});

afterEach(async () => {
  await app.close();
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

async function seed() {
  assert.equal((await app.inject({ method: "POST", url: "/api/room", payload: { roomId: "R1" } })).statusCode, 201);
  for (const u of ["AAAAAA", "BBBBBB"]) {
    const res = await app.inject({
      method: "POST",
      url: "/api/room/R1/users",
      payload: { userId: u, name: u === "AAAAAA" ? "alice" : "bob", privateBio: u === "AAAAAA" ? "alice private" : "bob private" },
    });
    assert.equal(res.statusCode, 201);
  }
}

// -- Store --------------------------------------------------------------------

test("store: handshake create is idempotent and reverse-merging", async () => {
  await seed();
  const first = store.createHandshake({ roomId: "R1", fromUser: "AAAAAA", toUser: "BBBBBB" });
  assert.ok(first !== "user-not-found" && first !== "same-users");
  assert.equal(first.created, true);
  assert.equal(first.record.statusFrom, "contacts");
  assert.equal(first.record.statusTo, "contacts");

  const again = store.createHandshake({ roomId: "R1", fromUser: "AAAAAA", toUser: "BBBBBB" });
  assert.equal(again.created, false);
  assert.equal(again.record.id, first.record.id);

  const reverse = store.createHandshake({ roomId: "R1", fromUser: "BBBBBB", toUser: "AAAAAA" });
  assert.equal(reverse.created, false);
  assert.equal(reverse.record.id, first.record.id);

  assert.equal(store.createHandshake({ roomId: "R1", fromUser: "AAAAAA", toUser: "AAAAAA" }), "same-users");
  assert.equal(store.createHandshake({ roomId: "R1", fromUser: "AAAAAA", toUser: "ZZZZZZ" }), "user-not-found");
});

test("store: status changes are per-side and private bio gates on mutual friend", async () => {
  await seed();
  const made = store.createHandshake({ roomId: "R1", fromUser: "AAAAAA", toUser: "BBBBBB" });
  if (made === "user-not-found" || made === "same-users") throw new Error("seed failed");
  const hs = made.record;

  assert.equal(store.isMutualFriend("R1", "AAAAAA", "BBBBBB"), false);

  assert.equal(store.setHandshakeStatus(hs.id, "AAAAAA", "friend"), "updated");
  assert.equal(store.isMutualFriend("R1", "AAAAAA", "BBBBBB"), false, "one side is not enough");

  assert.equal(store.setHandshakeStatus(hs.id, "BBBBBB", "friend"), "updated");
  assert.equal(store.isMutualFriend("R1", "AAAAAA", "BBBBBB"), true);

  assert.equal(store.setHandshakeStatus(hs.id, "ZZZZZZ", "friend"), "not-a-party");
  assert.equal(store.setHandshakeStatus("nope", "AAAAAA", "friend"), "not-found");

  const contacts = store.listContacts("R1", "AAAAAA");
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].peer.userId, "BBBBBB");
  assert.equal(contacts[0].friends, true);
});

// -- HTTP ----------------------------------------------------------------------

test("http: handshake REST flow + privateBio gating on /share", async () => {
  await seed();
  const made = await app.inject({
    method: "POST",
    url: "/api/room/R1/handshakes",
    payload: { fromUser: "AAAAAA", toUser: "BBBBBB" },
  });
  assert.equal(made.statusCode, 201);
  const hs = made.json<{ id: string }>();

  const list = await app.inject({ method: "GET", url: "/api/room/R1/handshakes?user=BBBBBB" });
  assert.equal(list.statusCode, 200);
  const contacts = list.json<Array<{ peer: { userId: string }; mine: string; friends: boolean }>>();
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].peer.userId, "AAAAAA");
  assert.equal(contacts[0].mine, "contacts");

  const share0 = await app.inject({ method: "GET", url: "/api/room/R1/users/AAAAAA/share?viewer=BBBBBB" });
  assert.equal(share0.statusCode, 200);
  const p0 = share0.json<{ privateBio?: string; handshake?: { id: string } }>();
  assert.equal(p0.privateBio, undefined);
  assert.equal(p0.handshake.id, hs.id);

  // Both must grade friend before private bio opens.
  assert.equal((await app.inject({ method: "PATCH", url: `/api/room/R1/handshakes/${hs.id}`, payload: { byUser: "AAAAAA", status: "friend" } })).statusCode, 200);
  const share1 = await app.inject({ method: "GET", url: "/api/room/R1/users/AAAAAA/share?viewer=BBBBBB" });
  assert.equal(share1.json<{ privateBio?: string }>().privateBio, undefined);

  const patch = await app.inject({
    method: "PATCH",
    url: `/api/room/R1/handshakes/${hs.id}`,
    payload: { byUser: "BBBBBB", status: "friend" },
  });
  assert.equal(patch.statusCode, 200);
  assert.equal(patch.json<{ friends: boolean }>().friends, true);

  const share2 = await app.inject({ method: "GET", url: "/api/room/R1/users/AAAAAA/share?viewer=BBBBBB" });
  const p2 = share2.json<{ privateBio?: string }>();
  assert.equal(p2.privateBio, "alice private");

  // No viewer at all — public fields only.
  const shareNoViewer = await app.inject({ method: "GET", url: "/api/room/R1/users/AAAAAA/share" });
  assert.equal(shareNoViewer.json<{ privateBio?: string }>().privateBio, undefined);

  // Bad statuses / foreign users rejected.
  assert.equal(
    (await app.inject({ method: "PATCH", url: `/api/room/R1/handshakes/${hs.id}`, payload: { byUser: "AAAAAA", status: "wife" } })).statusCode,
    400,
  );
  assert.equal(
    (await app.inject({ method: "PATCH", url: `/api/room/R1/handshakes/${hs.id}`, payload: { byUser: "ZZZZZZ", status: "friend" } })).statusCode,
    404,
  );
});
