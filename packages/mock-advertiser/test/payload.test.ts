import { test } from "node:test";
import assert from "node:assert/strict";
import { WRAPPER_SERVICE_UUID } from "@ble-id/shared-types";
import {
  buildAdvertisementPayloads,
  DEFAULT_NAME_PREFIX,
} from "../src/payload.js";

test("default payload fits the 31-byte legacy BLE limit", () => {
  const payloads = buildAdvertisementPayloads("AB3F2K");
  assert.ok(payloads.advertisementData.length <= 31);
  assert.ok(payloads.scanResponse.length <= 31);
});

test("advertisement data embeds flags + service data with UUID and ASCII id", () => {
  const payloads = buildAdvertisementPayloads("AB3F2K");

  assert.deepEqual(
    payloads.advertisementData.subarray(0, 3),
    Buffer.from([0x02, 0x01, 0x06]),
  );

  const serviceDataLen = payloads.advertisementData[3];
  const serviceData = payloads.advertisementData.subarray(3);
  assert.equal(serviceData.length, 1 + serviceDataLen);
  assert.equal(serviceData[1], 0x16);

  const uuidBytes = serviceData.subarray(2, 18);
  const expectedUuid = Buffer.from(
    WRAPPER_SERVICE_UUID.replace(/-/g, ""),
    "hex",
  ).reverse();
  assert.deepEqual(uuidBytes, expectedUuid);

  assert.equal(serviceData.subarray(18).toString("ascii"), "AB3F2K");
});

test("scan response carries the complete local name", () => {
  const payloads = buildAdvertisementPayloads("AB3F2K");
  assert.equal(payloads.scanResponse[0], payloads.scanResponse.length - 1);
  assert.equal(payloads.scanResponse[1], 0x09);
  assert.equal(
    payloads.scanResponse.subarray(2).toString("ascii"),
    `${DEFAULT_NAME_PREFIX} AB3F2K`,
  );
  assert.equal(payloads.localName, `${DEFAULT_NAME_PREFIX} AB3F2K`);
});

test("sha256 hex prefix id fills the slot without overflowing", () => {
  const payloads = buildAdvertisementPayloads("1A2B3C4D5E");
  assert.equal(payloads.advertisementData.length, 31);
  assert.equal(
    payloads.advertisementData.subarray(21).toString("ascii"),
    "1A2B3C4D5E",
  );
  assert.equal(payloads.localName, `${DEFAULT_NAME_PREFIX} 1A2B3C4D5E`);
});

test("long prefix is truncated, never overflowing 31 bytes", () => {
  const payloads = buildAdvertisementPayloads("AB3F2K", "X".repeat(64));
  assert.ok(payloads.scanResponse.length <= 31);
  assert.equal(payloads.localName.length, 29);
});

test("empty prefix trims to just the id", () => {
  const payloads = buildAdvertisementPayloads("AB3F2K", "");
  assert.equal(payloads.localName, "AB3F2K");
});
