import type { UserId } from "@ble-id/shared-types";
import type { AdvertiseTarget } from "./types.js";

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise<void>((resolve) => {
    let timer: NodeJS.Timeout | undefined;
    const onAbort = () => {
      if (timer !== undefined) clearTimeout(timer);
      resolve();
    };
    timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });

export interface MockDeviceOptions {
  target: AdvertiseTarget;
  intervalMs: number;
  idGen: () => UserId;
}

export interface RunOptions {
  durationMs?: number;
  once?: boolean;
}

export class MockDevice {
  currentId: UserId = "";

  private readonly target: AdvertiseTarget;
  private readonly intervalMs: number;
  private readonly idGen: () => UserId;
  private readonly abortController = new AbortController();

  constructor(options: MockDeviceOptions) {
    this.target = options.target;
    this.intervalMs = options.intervalMs;
    this.idGen = options.idGen;
  }

  async start(): Promise<void> {
    this.currentId = this.idGen();
    await this.target.start(this.currentId);
  }

  async rotate(): Promise<void> {
    this.currentId = this.idGen();
    await this.target.rotate(this.currentId);
  }

  abort(): void {
    this.abortController.abort();
  }

  async stop(): Promise<void> {
    await this.target.stop();
  }

  async run(options: RunOptions = {}): Promise<void> {
    const { durationMs, once } = options;
    const startedAt = Date.now();
    try {
      await this.start();
      if (once) return;
      for (;;) {
        let wait = this.intervalMs;
        if (durationMs !== undefined) {
          const remaining = durationMs - (Date.now() - startedAt);
          if (remaining <= 0) break;
          wait = Math.min(wait, remaining);
        }
        await sleep(wait, this.abortController.signal);
        if (
          this.abortController.signal.aborted ||
          (durationMs !== undefined && Date.now() - startedAt >= durationMs)
        ) {
          break;
        }
        try {
          await this.rotate();
        } catch (err) {
          await this.target.stop();
          throw err;
        }
      }
    } finally {
      await this.stop();
    }
  }
}
