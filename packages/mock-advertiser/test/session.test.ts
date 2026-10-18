import { test } from "node:test";
import assert from "node:assert/strict";
import type { UserId } from "@ble-id/shared-types";
import { MockDevice } from "../src/session.js";
import type { AdvertiseMode, AdvertiseTarget } from "../src/types.js";

class RecordingTarget implements AdvertiseTarget {
  readonly mode: AdvertiseMode = "dry-run";
  calls: Array<{ kind: "start" | "rotate" | "stop"; id?: string }> = [];
  private failRotate = false;
  rotateError = new Error("bluez blew up");

  setFailRotate(fail: boolean): void {
    this.failRotate = fail;
  }

  async start(id: UserId): Promise<void> {
    this.calls.push({ kind: "start", id });
  }

  async rotate(id: UserId): Promise<void> {
    this.calls.push({ kind: "rotate", id });
    if (this.failRotate) throw this.rotateError;
  }

  async stop(): Promise<void> {
    this.calls.push({ kind: "stop" });
  }
}

function sequenceIdGen(ids: UserId[]): () => UserId {
  let i = 0;
  return () => ids[i++ % ids.length];
}

test("run with duration: starts, rotates on interval, stops", async () => {
  const target = new RecordingTarget();
  const device = new MockDevice({
    target,
    intervalMs: 20,
    idGen: sequenceIdGen(["AAAAAA", "BBBBBB", "CCCCCC", "DDDDDD"]),
  });

  await device.run({ durationMs: 70 });

  assert.equal(target.calls[0].kind, "start");
  assert.equal(target.calls[0].id, "AAAAAA");
  assert.ok(target.calls.some((c) => c.kind === "rotate"));
  assert.ok(target.calls.filter((c) => c.kind === "rotate").length >= 2);
  assert.equal(target.calls.at(-1)?.kind, "stop");
});

test("run once: single start, no rotation, stop", async () => {
  const target = new RecordingTarget();
  const device = new MockDevice({
    target,
    intervalMs: 5,
    idGen: sequenceIdGen(["AAAAAA"]),
  });

  await device.run({ once: true });

  assert.equal(target.calls.length, 2);
  assert.equal(target.calls[0].kind, "start");
  assert.equal(target.calls[1].kind, "stop");
});

test("rotate delivers next generated id", async () => {
  const target = new RecordingTarget();
  const device = new MockDevice({
    target,
    intervalMs: 10,
    idGen: sequenceIdGen(["AAAAAA", "BBBBBB"]),
  });

  await device.start();
  await device.rotate();

  assert.deepEqual(target.calls, [
    { kind: "start", id: "AAAAAA" },
    { kind: "rotate", id: "BBBBBB" },
  ]);
});

test("abort resolves an endless run and still stops the target", async () => {
  const target = new RecordingTarget();
  const device = new MockDevice({
    target,
    intervalMs: 10,
    idGen: sequenceIdGen(["AAAAAA", "BBBBBB"]),
  });

  const runPromise = device.run();
  setTimeout(() => device.abort(), 25);
  await runPromise;

  assert.ok(target.calls.length >= 3);
  assert.equal(target.calls.at(-1)?.kind, "stop");
});

test("rotate failure propagates out of run after stopping", async () => {
  const target = new RecordingTarget();
  target.setFailRotate(true);
  const device = new MockDevice({
    target,
    intervalMs: 10,
    idGen: sequenceIdGen(["AAAAAA", "BBBBBB"]),
  });

  await assert.rejects(
    device.run({ durationMs: 50 }),
    (err: Error) => err.message === "bluez blew up",
  );
  assert.ok(target.calls.some((c) => c.kind === "stop"));
});
