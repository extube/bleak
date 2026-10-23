import { test } from "node:test";
import assert from "node:assert/strict";
import { USER_ID_LENGTH } from "@ble-id/shared-types";
import {
  ID_CHARSET,
  HASH_ID_LENGTH,
  randomHashId,
  randomId,
  isValidMockId,
} from "../src/id.js";

test("randomHashId is a sha256 hex prefix of the fixed length", () => {
  for (let i = 0; i < 200; i++) {
    const id = randomHashId();
    assert.equal(id.length, HASH_ID_LENGTH);
    assert.match(id, /^[0-9A-F]+$/);
  }
});

test("randomHashId is deterministic per seed and non-deterministic across seeds", () => {
  const seed = Buffer.alloc(16, 7);
  assert.equal(randomHashId(seed), randomHashId(seed));
  const ids = new Set(Array.from({ length: 50 }, () => randomHashId()));
  assert.ok(ids.size > 1);
});

test("randomId produces USER_ID_LENGTH ids from the charset", () => {
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

test("isValidMockId accepts generated ids and rejects garbage", () => {
  assert.ok(isValidMockId(randomId()));
  assert.ok(isValidMockId("AB3F2K"));
  assert.equal(isValidMockId("AB3F2"), false);
  assert.equal(isValidMockId("AB3F2KX"), false);
  assert.equal(isValidMockId("AB3F2O"), false); // O excluded from charset
  assert.equal(isValidMockId(""), false);
});

test("isValidMockId accepts sha256 hex prefixes", () => {
  assert.ok(isValidMockId(randomHashId()));
  assert.ok(isValidMockId("1A2B3C4D5E"));
  assert.ok(isValidMockId("1a2b3c4d5e"));
  assert.equal(isValidMockId("1A2B3C4D5EF"), false); // 11 chars
  assert.equal(isValidMockId("1A2B3C4DG"), false); // not hex
});
