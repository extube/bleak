import {
  APP_ID_ORIGINAL,
  BEACON_SERVICE_UUID,
  BEACON_SERVICE_UUID16,
  BEACON_USER_ID_BYTES,
  WRAPPER_SERVICE_UUID,
  type UserId,
} from "@ble-id/shared-types";
import { isValidBeaconUserId, randomBeaconUserId } from "./id.js";
import { MockDevice } from "./session.js";
import { BluezAdvertiser } from "./bluez.js";
import { DryRunTarget } from "./dryrun.js";
import type { AdvertiseMode, TargetHooks } from "./types.js";
import { DEFAULT_NAME_PREFIX } from "./payload.js";

const DEFAULT_INTERVAL_MS = 5000;
const MIN_INTERVAL_MS = 200;

export interface CliArgs {
  intervalMs: number;
  fixedId: UserId | null;
  prefix: string;
  dryRun: boolean;
  once: boolean;
  json: boolean;
  durationMs: number | null;
  help: boolean;
}

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode = 2,
  ) {
    super(message);
  }
}

export function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = {
    intervalMs: DEFAULT_INTERVAL_MS,
    fixedId: null,
    prefix: DEFAULT_NAME_PREFIX,
    dryRun: false,
    once: false,
    json: false,
    durationMs: null,
    help: false,
  };

  const takeNumber = (flag: string, value: string): number => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
      throw new CliError(`${flag} expects a positive integer, got "${value}"`);
    }
    return n;
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => argv[++i];
    switch (flag) {
      case "--interval": {
        args.intervalMs = takeNumber("--interval", value());
        break;
      }
      case "--duration": {
        args.durationMs = takeNumber("--duration", value());
        break;
      }
      case "--id": {
        const raw = value().trim().toUpperCase();
        if (!isValidBeaconUserId(raw)) {
          throw new CliError(
            `--id expects a ${BEACON_USER_ID_BYTES}-character hex sha256 prefix, got "${raw}"`,
          );
        }
        args.fixedId = raw;
        break;
      }
      case "--prefix": {
        args.prefix = value().trim();
        break;
      }
      case "--dry-run": {
        args.dryRun = true;
        break;
      }
      case "--once": {
        args.once = true;
        break;
      }
      case "--json": {
        args.json = true;
        break;
      }
      case "-h":
      case "--help": {
        args.help = true;
        break;
      }
      default: {
        throw new CliError(`unknown argument: ${flag}`);
      }
    }
  }

  if (args.prefix !== "" && !/^[\x20-\x7e]+$/.test(args.prefix)) {
    throw new CliError(
      `--prefix must be printable ASCII, got "${args.prefix}"`,
    );
  }
  if (args.intervalMs < MIN_INTERVAL_MS) {
    throw new CliError(`--interval must be >= ${MIN_INTERVAL_MS}ms`);
  }
  return args;
}

const USAGE = `ble-mock-advertiser — advertise beacon ids over BLE on desktop Linux for testing.

Each beacon advertises 20 bytes of service data (UUID 0xFFE0):
  16 hex chars of user id (sha256 prefix over fresh random bytes)
+ 4 bytes of app id ("b1e4d1a0" = original, "b1e4d1a1" = retranslated).

Usage: ble-mock-advertiser [options]

Options:
  --interval <ms>   rotate the ID every <ms>              (default 5000)
  --id <ID>         advertise a fixed 16-char hex user id, no rotation
  --prefix <name>   local-name prefix                     (default "BLE-ID")
  --duration <ms>   exit automatically after <ms>
  --once            emit one ID, then exit
  --dry-run         log payloads to stdout only, never touch Bluetooth
  --json            JSON-lines output for scripts/tests
  -h, --help        show this help

Without BlueZ (bluetoothd) the tool automatically falls back to dry-run.`;

function ts(): string {
  return new Date().toISOString().slice(11, 19);
}

export function buildHooks(
  json: boolean,
  getMode: () => AdvertiseMode,
): TargetHooks {
  if (json) {
    return {
      onAdvert: (info) =>
        console.log(
          JSON.stringify({
            t: Date.now(),
            event: "advert",
            mode: getMode(),
            ...info,
          }),
        ),
      onClaim: (payload) =>
        console.log(
          JSON.stringify({
            t: Date.now(),
            event: "claim",
            mode: getMode(),
            data: payload.toString("hex"),
            ascii: payload.toString("ascii"),
          }),
        ),
      onNote: (message) =>
        console.log(
          JSON.stringify({ t: Date.now(), event: "note", message }),
        ),
    };
  }
  return {
    onAdvert: (info) =>
      console.log(
        `[${ts()}] advert  id=${info.id}  name="${info.localName}"  adv=${info.advHex}  scan=${info.scanHex}`,
      ),
    onClaim: (payload) =>
      console.log(
        `[${ts()}] claim   data=${payload.toString("hex")} ("${payload.toString("ascii")}")`,
      ),
    onNote: (message) => console.log(`[${ts()}] note    ${message}`),
  };
}

async function main(): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`ble-mock-advertiser: ${(err as Error).message}`);
    console.error(`\n${USAGE}`);
    return err instanceof CliError ? err.exitCode : 2;
  }
  if (args.help) {
    console.log(USAGE);
    return 0;
  }

  let mode: AdvertiseMode = args.dryRun ? "dry-run" : "bluez";
  const hooks = buildHooks(args.json, () => mode);

  let target;
  if (args.dryRun) {
    target = new DryRunTarget(hooks);
  } else {
    try {
      target = await BluezAdvertiser.connect(
        hooks,
        APP_ID_ORIGINAL,
        args.prefix,
      );
      mode = "bluez";
    } catch (err) {
      hooks.onNote?.((err as Error).message);
      hooks.onNote?.("falling back to dry-run mode");
      mode = "dry-run";
      target = new DryRunTarget(hooks);
    }
  }

  if (!args.json) {
    console.log(
      `[${ts()}] ready   mode=${mode}  interval=${args.intervalMs}ms  service=0xFFE0 (${WRAPPER_SERVICE_UUID} legacy)`,
    );
  } else {
    console.log(
      JSON.stringify({
        t: Date.now(),
        event: "ready",
        mode,
        intervalMs: args.intervalMs,
        service: BEACON_SERVICE_UUID,
        serviceShort: BEACON_SERVICE_UUID16,
      }),
    );
  }

  const device = new MockDevice({
    target,
    intervalMs: args.intervalMs,
    idGen: args.fixedId ? () => args.fixedId as UserId : randomBeaconUserId,
  });
  process.on("SIGINT", () => device.abort());
  process.on("SIGTERM", () => device.abort());

  try {
    await device.run({
      durationMs: args.durationMs ?? undefined,
      once: args.once,
    });
  } catch (err) {
    hooks.onNote?.(`fatal: ${(err as Error).message}`);
    if (args.json) {
      console.log(
        JSON.stringify({
          t: Date.now(),
          event: "error",
          message: (err as Error).message,
        }),
      );
    }
    return 1;
  }
  return 0;
}

process.exitCode = await main();
