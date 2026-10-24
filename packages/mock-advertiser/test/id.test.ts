import { test } from "node:test";
import assert from "node:assert/strict";
import { BEACON_USER_ID_BYTES, USER_ID_LENGTH } from "@ble-id/shared-types";
import {
  ID_CHARSET,
  randomBeaconUserId,
  randomId,
  isValidBeaconUserId,
  isValidMockId,
} from "../src/id.js";

test("randomBeaconUserId is a 16-char hex sha256 prefix", () => {
  for (let i = 0; i < 200; i++) {
    const id = randomBeaconUserId();
    assert.equal(id.length, BEACON_USER_ID_BYTES);
    assert.match(id, /^[0-9A-F]+$/);
  }
});

test("randomBeaconUserId is deterministic per seed and non-deterministic on rotation", () => {
  const seed = Buffer.alloc(16, 7);
  assert.equal(randomBeaconUserId(seed), randomBeaconUserId(seed));
  const ids = new Set(Array.from({ length: 50 }, () => randomBeaconUserId()));
  assert.ok(ids.size > 1);
});

test("isValidBeaconUserId accepts hex users and rejects garbage", () => {
  assert.ok(isValidBeaconUserId(randomBeaconUserId()));
  assert.ok(isValidBeaconUserId("0123456789abcdef"));
  assert.equal(isValidBeaconUserId("0123456789ABCDE"), false); // 15
  assert.equal(isValidBeaconUserId("0123456789ABCDG0"), false); // not hex
  assert.equal(isValidBeaconUserId(""), false);
});

test("randomId still produces USER_ID_LENGTH ids from the charset", () => {
  for (let i = 0; i < 200; i++) {
    const id = randomId();
    assert.equal(id.length, USER_ID_LENGTH);
    for (const c of id) {
      assert.ok(ID_CHARSET.includes(c), `unexpected char ${c}`);
    }
  }
});

test("randomId is not deterministic", () => {
  const ids = new Set(Array.from({ length: 50 }, randomId));
  assert.ok(ids.size > 1);
});

test("isValidMockId accepts beacon users and legacy charset ids", () => {
  assert.ok(isValidMockId(randomBeaconUserId()));
  assert.ok(isValidMockId("AB3F2K"));
  assert.equal(isValidMockId("AB3F2"), false);
  assert.equal(isValidMockId("AB3F2KX"), false);
  assert.equal(isValidMockId("AB3F2O"), false); // O excluded from charset
  assert.equal(isValidMockId(""), false);
});
