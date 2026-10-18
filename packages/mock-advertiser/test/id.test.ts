import { test } from "node:test";
import assert from "node:assert/strict";
import { USER_ID_LENGTH } from "@ble-id/shared-types";
import { ID_CHARSET, randomId, isValidMockId } from "../src/id.js";

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
