import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APP_ID_ORIGINAL,
  APP_ID_RETRANSLATED,
  BEACON_APP_ID_BYTES,
  BEACON_USER_ID_BYTES,
} from "@ble-id/shared-types";
import {
  buildAdvertisementPayloads,
  concatBeaconPayload,
  parseBeaconPayload,
  DEFAULT_NAME_PREFIX,
} from "../src/payload.js";

const USER_ID = "0123456789ABCDEF";

test("ad fits the 31-byte legacy BLE limit", () => {
  const payloads = buildAdvertisementPayloads(USER_ID);
  assert.ok(payloads.advertisementData.length <= 31);
  assert.ok(payloads.scanResponse.length <= 31);
});

test("advertisement embeds flags + 0xFFE0 service data with 20-byte beacon", () => {
  const payloads = buildAdvertisementPayloads(USER_ID, APP_ID_ORIGINAL);

  assert.deepEqual(
    payloads.advertisementData.subarray(0, 3),
    Buffer.from([0x02, 0x01, 0x06]),
  );
  assert.equal(payloads.advertisementData[4], 0x16); // service data AD type

  const serviceData = payloads.advertisementData.subarray(3);
  assert.equal(serviceData.length, 1 + serviceData[0]);
  assert.deepEqual(serviceData.subarray(2, 4), Buffer.from([0xff, 0xe0]));

  const beacon = serviceData.subarray(4);
  assert.equal(beacon.length, BEACON_USER_ID_BYTES + BEACON_APP_ID_BYTES);
  assert.equal(beacon.subarray(0, 16).toString("ascii"), USER_ID);
  assert.deepEqual(Uint8Array.from(beacon.subarray(16)), APP_ID_ORIGINAL);
});

test("re-translated app id differs and round-trips through parseBeaconPayload", () => {
  const original = buildAdvertisementPayloads(USER_ID, APP_ID_ORIGINAL);
  const relaid = buildAdvertisementPayloads(USER_ID, APP_ID_RETRANSLATED);
  assert.ok(
    !original.advertisementData.subarray(25).equals(relaid.advertisementData.subarray(25)),
  );

  for (const appId of [APP_ID_ORIGINAL, APP_ID_RETRANSLATED]) {
    const raw = concatBeaconPayload(USER_ID, appId);
    assert.deepEqual(parseBeaconPayload(raw), {
      userId: USER_ID,
      appId: Uint8Array.from(appId),
    });
  }
});

test("scan response carries the full local name", () => {
  const payloads = buildAdvertisementPayloads(USER_ID);
  assert.equal(payloads.scanResponse[0], payloads.scanResponse.length - 1);
  assert.equal(payloads.scanResponse[1], 0x09);
  assert.equal(
    payloads.scanResponse.subarray(2).toString("ascii"),
    `${DEFAULT_NAME_PREFIX} ${USER_ID}`,
  );
  assert.equal(payloads.localName, `${DEFAULT_NAME_PREFIX} ${USER_ID}`);
});

test("long prefix is truncated, never overflowing 31 bytes", () => {
  const payloads = buildAdvertisementPayloads(USER_ID, APP_ID_ORIGINAL, "X".repeat(64));
  assert.ok(payloads.scanResponse.length <= 31);
  assert.ok(payloads.localName.length <= 29);
});

test("empty prefix trims local name to the id", () => {
  const payloads = buildAdvertisementPayloads(USER_ID, APP_ID_ORIGINAL, "");
  assert.equal(payloads.localName, USER_ID);
});

test("rejects malformed ids and app ids", () => {
  assert.throws(() => buildAdvertisementPayloads("SHORT"));
  assert.throws(() =>
    buildAdvertisementPayloads(USER_ID, Buffer.alloc(3)),
  );
});
