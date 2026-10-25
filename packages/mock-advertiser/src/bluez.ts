import dbus, { Message, Variant, interface as dbusIface } from "dbus-next";
import {
  APP_ID_ORIGINAL,
  BEACON_SERVICE_UUID,
  WRAPPER_CLAIM_CHAR_UUID,
  WRAPPER_EXCHANGE_CHAR_UUID,
  WRAPPER_SERVICE_UUID,
  type UserId,
} from "@ble-id/shared-types";
import {
  buildAdvertisementPayloads,
  concatBeaconPayload,
  type AdvertisementPayloads,
} from "./payload.js";
import type { AdvertiseMode, AdvertiseTarget, TargetHooks } from "./types.js";

const LE_ADV_IFACE = "org.bluez.LEAdvertisement1";
const LE_ADV_MANAGER_IFACE = "org.bluez.LEAdvertisingManager1";
const GATT_SERVICE_IFACE = "org.bluez.GattService1";
const GATT_CHAR_IFACE = "org.bluez.GattCharacteristic1";
const GATT_MANAGER_IFACE = "org.bluez.GattManager1";
const OBJECT_MANAGER_IFACE = "org.freedesktop.DBus.ObjectManager";
const PROPERTIES_IFACE = "org.freedesktop.DBus.Properties";

const APP_PATH = "/io/bleid/mock";
const SERVICE_PATH = `${APP_PATH}/service0`;
const EXCHANGE_PATH = `${SERVICE_PATH}/exchange`;
const CLAIM_PATH = `${SERVICE_PATH}/claim`;
const ADV_PATH_BASE = `${APP_PATH}/adv`;

interface DeviceState {
  userId: string;
  appId: Uint8Array;
  prefix: string;
}

class MockLeAdvertisement extends dbusIface.Interface {
  private readonly state: DeviceState;

  constructor(state: DeviceState) {
    super(LE_ADV_IFACE);
    this.state = state;
  }

  get Type(): string {
    return "peripheral";
  }

  get ServiceUUIDs(): string[] {
    return [WRAPPER_SERVICE_UUID];
  }

  get ServiceData(): Record<string, Variant> {
    return {
      [BEACON_SERVICE_UUID]: new Variant(
        "ay",
        concatBeaconPayload(this.state.userId, this.state.appId),
      ),
    };
  }

  get LocalName(): string {
    return `${this.state.prefix} ${this.state.userId}`.trim();
  }

  get Includes(): string[] {
    return ["local-name"];
  }

  Release(): void {}
}

MockLeAdvertisement.configureMembers({
  properties: {
    Type: { signature: "s", access: "read" },
    ServiceUUIDs: { signature: "as", access: "read" },
    ServiceData: { signature: "a{sv}", access: "read" },
    LocalName: { signature: "s", access: "read" },
    Includes: { signature: "as", access: "read" },
  },
  methods: {
    Release: {},
  },
});

class MockGattService extends dbusIface.Interface {
  constructor() {
    super(GATT_SERVICE_IFACE);
  }

  get UUID(): string {
    return WRAPPER_SERVICE_UUID;
  }

  get Primary(): boolean {
    return true;
  }

  get Includes(): string[] {
    return [];
  }
}

MockGattService.configureMembers({
  properties: {
    UUID: { signature: "s", access: "read" },
    Primary: { signature: "b", access: "read" },
    Includes: { signature: "ao", access: "read" },
  },
});

type DictOfVariants = Record<string, Variant>;

class MockExchangeCharacteristic extends dbusIface.Interface {
  private readonly state: DeviceState;

  constructor(state: DeviceState) {
    super(GATT_CHAR_IFACE);
    this.state = state;
  }

  get UUID(): string {
    return WRAPPER_EXCHANGE_CHAR_UUID;
  }

  get Service(): string {
    return SERVICE_PATH;
  }

  get Flags(): string[] {
    return ["read"];
  }

  ReadValue(_options: Record<string, unknown>): Buffer {
    return Buffer.from(this.state.userId, "ascii");
  }
}

MockExchangeCharacteristic.configureMembers({
  properties: {
    UUID: { signature: "s", access: "read" },
    Service: { signature: "o", access: "read" },
    Flags: { signature: "as", access: "read" },
  },
  methods: {
    ReadValue: { inSignature: "a{sv}", outSignature: "ay" },
  },
});

class MockClaimCharacteristic extends dbusIface.Interface {
  private readonly hooks: TargetHooks;

  constructor(hooks: TargetHooks) {
    super(GATT_CHAR_IFACE);
    this.hooks = hooks;
  }

  get UUID(): string {
    return WRAPPER_CLAIM_CHAR_UUID;
  }

  get Service(): string {
    return SERVICE_PATH;
  }

  get Flags(): string[] {
    return ["write", "write-without-response"];
  }

  WriteValue(value: Buffer, _options: Record<string, unknown>): void {
    this.hooks.onClaim?.(value);
  }
}

MockClaimCharacteristic.configureMembers({
  properties: {
    UUID: { signature: "s", access: "read" },
    Service: { signature: "o", access: "read" },
    Flags: { signature: "as", access: "read" },
  },
  methods: {
    WriteValue: { inSignature: "aya{sv}", outSignature: "" },
  },
});

class MockObjectManager extends dbusIface.Interface {
  constructor() {
    super(OBJECT_MANAGER_IFACE);
  }

  GetManagedObjects(): Record<string, Record<string, DictOfVariants>> {
    return {
      [SERVICE_PATH]: {
        [GATT_SERVICE_IFACE]: {
          UUID: new Variant("s", WRAPPER_SERVICE_UUID),
          Primary: new Variant("b", true),
        },
      },
      [EXCHANGE_PATH]: {
        [GATT_CHAR_IFACE]: {
          UUID: new Variant("s", WRAPPER_EXCHANGE_CHAR_UUID),
          Service: new Variant("o", SERVICE_PATH),
          Flags: new Variant("as", ["read"]),
        },
      },
      [CLAIM_PATH]: {
        [GATT_CHAR_IFACE]: {
          UUID: new Variant("s", WRAPPER_CLAIM_CHAR_UUID),
          Service: new Variant("o", SERVICE_PATH),
          Flags: new Variant("as", ["write", "write-without-response"]),
        },
      },
    };
  }
}

MockObjectManager.configureMembers({
  methods: {
    GetManagedObjects: {
      inSignature: "",
      outSignature: "a{oa{sa{sv}}}",
    },
  },
});

interface ManagedObjectEntry {
  [interfaceName: string]: Record<string, unknown>;
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  what: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`${what} timed out after ${ms}ms (is bluetoothd running?)`));
    }, ms);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

interface RegisteredAdvertisement {
  path: string;
  instance: MockLeAdvertisement;
  payloads: AdvertisementPayloads;
}

export interface BluezAdvertiserOptions {
  prefix: string;
  appId: Uint8Array;
  hooks: TargetHooks;
}

export class BluezAdvertiser implements AdvertiseTarget {
  readonly mode: AdvertiseMode = "bluez";

  private readonly bus: dbus.MessageBus;
  private readonly adapterProxy: dbus.ProxyObject;
  private readonly state: DeviceState;
  private readonly hooks: TargetHooks;

  private advCounter = 0;
  private currentAdv: RegisteredAdvertisement | null = null;
  private appRegistered = false;

  private constructor(
    bus: dbus.MessageBus,
    adapterProxy: dbus.ProxyObject,
    hooks: TargetHooks,
    appId: Uint8Array,
    prefix: string,
  ) {
    this.bus = bus;
    this.adapterProxy = adapterProxy;
    this.hooks = hooks;
    this.state = { userId: "", appId, prefix };
  }

  static async connect(
    hooks: TargetHooks,
    appId: Uint8Array = APP_ID_ORIGINAL,
    prefix: string,
  ): Promise<BluezAdvertiser> {
    const bus = dbus.systemBus();
    bus.on("error", () => undefined);
    let managed: Record<string, ManagedObjectEntry>;
    try {
      const reply = await withTimeout(
        bus.call(
          new Message({
            destination: "org.bluez",
            path: "/",
            interface: OBJECT_MANAGER_IFACE,
            member: "GetManagedObjects",
          }),
        ),
        4000,
        "BlueZ GetManagedObjects",
      );
      if (!reply || !reply.body || !reply.body[0]) {
        throw new Error("BlueZ returned no managed objects");
      }
      managed = reply.body[0] as Record<string, ManagedObjectEntry>;
    } catch (err) {
      bus.disconnect();
      throw new Error(
        `cannot talk to BlueZ over the system bus: ${(err as Error).message}`,
      );
    }

    const adapterPaths = Object.keys(managed).filter(
      (path) =>
        path.startsWith("/org/bluez/hci") &&
        LE_ADV_MANAGER_IFACE in managed[path],
    );
    if (adapterPaths.length === 0) {
      bus.disconnect();
      throw new Error(
        "no Bluetooth adapter with org.bluez.LEAdvertisingManager1 found",
      );
    }
    const adapterPath =
      adapterPaths.find((path) => GATT_MANAGER_IFACE in managed[path]) ??
      adapterPaths[0];
    if (!(GATT_MANAGER_IFACE in managed[adapterPath])) {
      hooks.onNote?.(
        `adapter ${adapterPath} lacks GattManager1; GATT service will be skipped`,
      );
    }

    const adapterProxy = await withTimeout(
      bus.getProxyObject("org.bluez", adapterPath),
      4000,
      `BlueZ proxy for ${adapterPath}`,
    );
    try {
      const props = adapterProxy.getInterface(PROPERTIES_IFACE);
      await withTimeout(
        props.Set("org.bluez.Adapter1", "Powered", new Variant("b", true)),
        2000,
        "adapter Powered=true",
      );
    } catch (err) {
      hooks.onNote?.(
        `could not force adapter Powered=true (${(err as Error).message}); continuing as-is`,
      );
    }

    return new BluezAdvertiser(bus, adapterProxy, hooks, appId, prefix);
  }

  async start(id: UserId): Promise<void> {
    this.state.userId = id;
    await this.registerGattApplication();
    await this.registerAdvertisement();
  }

  async rotate(id: UserId): Promise<void> {
    this.state.userId = id;
    await this.registerAdvertisement();
  }

  async stop(): Promise<void> {
    if (this.currentAdv) {
      try {
        await (this.adapterProxy.getInterface(
          LE_ADV_MANAGER_IFACE,
        ) as any).UnregisterAdvertisement(this.currentAdv.path);
      } catch {
        // best effort
      }
      this.bus.unexport(this.currentAdv.path, this.currentAdv.instance);
      this.currentAdv = null;
    }
    if (this.appRegistered) {
      try {
        await (this.adapterProxy.getInterface(
          GATT_MANAGER_IFACE,
        ) as any).UnregisterApplication(APP_PATH);
      } catch {
        // best effort
      }
      this.appRegistered = false;
    }
    this.bus.disconnect();
  }

  private async registerGattApplication(): Promise<void> {
    try {
      this.bus.export(APP_PATH, new MockObjectManager());
      this.bus.export(SERVICE_PATH, new MockGattService());
      this.bus.export(EXCHANGE_PATH, new MockExchangeCharacteristic(this.state));
      this.bus.export(CLAIM_PATH, new MockClaimCharacteristic(this.hooks));
      await withTimeout(
        (this.adapterProxy.getInterface(GATT_MANAGER_IFACE) as any)
          .RegisterApplication(APP_PATH),
        5000,
        "GattManager1.RegisterApplication",
      );
      this.appRegistered = true;
    } catch (err) {
      this.hooks.onNote?.(
        `GATT application registration skipped: ${(err as Error).message}`,
      );
    }
  }

  private async registerAdvertisement(): Promise<void> {
    const payloads = buildAdvertisementPayloads(
      this.state.userId,
      this.state.appId,
    );
    const path = `${ADV_PATH_BASE}/${++this.advCounter}`;
    const instance = new MockLeAdvertisement(this.state);
    this.bus.export(path, instance);
    const advManager = this.adapterProxy.getInterface(
      LE_ADV_MANAGER_IFACE,
    ) as any;

    try {
      await withTimeout(
        advManager.RegisterAdvertisement(path),
        5000,
        "LEAdvertisingManager1.RegisterAdvertisement",
      );
    } catch (err) {
      if (this.currentAdv) {
        await withTimeout(
          advManager.UnregisterAdvertisement(this.currentAdv.path).catch(
            () => undefined,
          ),
          5000,
          "UnregisterAdvertisement",
        ).catch(() => undefined);
        await withTimeout(
          advManager.RegisterAdvertisement(path),
          5000,
          "LEAdvertisingManager1.RegisterAdvertisement",
        );
      } else {
        throw new Error(
          `RegisterAdvertisement failed: ${(err as Error).message}`,
        );
      }
    }

    if (this.currentAdv) {
      await withTimeout(
        advManager
          .UnregisterAdvertisement(this.currentAdv.path)
          .catch(() => undefined),
        5000,
        "UnregisterAdvertisement",
      ).catch(() => undefined);
    }
    this.hooks.onAdvert?.({
      id: this.state.userId,
      localName: payloads.localName,
      serviceUuid: WRAPPER_SERVICE_UUID,
      advHex: payloads.advertisementData.toString("hex"),
      scanHex: payloads.scanResponse.toString("hex"),
    });
    this.currentAdv = { path, instance, payloads };
  }
}
