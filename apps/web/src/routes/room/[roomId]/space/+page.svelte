<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import type { RelayEvent } from "@ble-id/shared-types";
  import { WRAPPER_SERVICE_UUID } from "@ble-id/shared-types";
  import { getRoomUser } from "$lib/roomUser";
  import { createRelay, type Relay, type RelayState } from "$lib/relay";

  const roomId = $derived(page.params.roomId ?? "");
  const user = $derived(getRoomUser(roomId));

  type Peer = { userId: string; source: "relay" | "ble"; lastSeen: number };

  let peers = $state<Peer[]>([]);
  let log = $state<string[]>([]);
  let bleState = $state("BLE listening off");
  let bleError = $state("");

  function addPeer(peer: Peer) {
    peers = [
      peer,
      ...peers.filter((p) => !(p.userId === peer.userId && p.source === peer.source)),
    ];
  }

  function logLine(text: string) {
    log = [`${new Date().toLocaleTimeString()} — ${text}`, ...log].slice(0, 50);
  }

  // -- Relay listen -------------------------------------------------------------

  let relay: Relay | null = null;
  let relayStatus = $state<RelayState>({ status: "idle" });

  function onRelayEvent(msg: RelayEvent) {
    switch (msg.type) {
      case "connected":
        relayStatus = { status: "open", clientId: msg.clientId };
        logLine("relay: connected — listening");
        break;
      case "claim-opened":
        addPeer({
          userId: msg.claim.userId,
          source: "relay",
          lastSeen: msg.claim.createdAt,
        });
        logLine(`relay: ${msg.claim.userId} claimed via ${msg.claim.exchangeCode}`);
        break;
      case "claim-closed":
        peers = peers.filter((p) => !(p.userId === msg.userId && p.source === "relay"));
        logLine(`relay: ${msg.userId} left`);
        break;
      case "noop":
        break;
      default:
        break;
    }
  }

  function onRelayStatus(state: RelayState) {
    relayStatus = state;
    if (state.status === "closed") logLine("relay: reconnecting…");
    if (state.status === "error") logLine("relay: connection error — retrying");
  }

  // -- BLE listen (advertised info) ----------------------------------------------

  /** Same 30-char alphabet as the identity generator — readable aloud ids. */
  const AD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const USER_ID_BYTES = 16;

  type AdvertisedData = { serviceData?: Map<string, unknown>; name?: string };

  function decodeUserId(event: AdvertisedData): string | null {
    const data = event.serviceData?.get(WRAPPER_SERVICE_UUID);
    if (!(data instanceof ArrayBuffer)) return null;
    const bytes = new Uint8Array(data);
    if (bytes.length < USER_ID_BYTES) return null;
    let out = "";
    for (let i = 0; i < USER_ID_BYTES; i++) {
      out += AD_ALPHABET[bytes[i] % AD_ALPHABET.length];
    }
    return out;
  }

  const attachedBle: { device: BluetoothDevice; controller: AbortController }[] = [];

  async function startBleListen() {
    bleError = "";
    if (!("bluetooth" in navigator)) {
      bleError = "Web Bluetooth is unavailable here — relay listening continues.";
      bleState = "BLE unavailable";
      return;
    }
    try {
      // The browser's bluetooth permission prompt fires on this user gesture.
      const device: BluetoothDevice = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [WRAPPER_SERVICE_UUID],
      });
      device.addEventListener("advertisementreceived", ((event: AdvertisedData) => {
        const userId = decodeUserId(event);
        if (userId) {
          addPeer({ userId, source: "ble", lastSeen: Date.now() });
          logLine(`ble: ${userId} advertised`);
        } else {
          logLine(`ble: advertisement from ${event.name || "device"}`);
        }
      }) as EventListener);
      // watchAdvertisements() is the actual "listen advertised info" call —
      // on Chrome it may raise its own permission prompt the first time.
      const controller = new AbortController();
      await device.watchAdvertisements({ signal: controller.signal });
      attachedBle.push({ device, controller });
      bleState = `BLE listening (${device.name ?? "unnamed device"})`;
      logLine(`ble: ad listener attached to ${device.name ?? "device"}`);
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotFoundError") {
        bleState = "BLE device picker closed";
        return;
      }
      bleError = `BLE permission failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  function stopBleListen() {
    attachedBle.forEach((a) => a.controller.abort());
    attachedBle.length = 0;
    bleState = "BLE listening off";
  }

  onMount(() => {
    if (!roomId || !user) {
      goto(`/room/${roomId}/login`, { replaceState: true });
      return undefined;
    }
    relay = createRelay(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
      onRelayEvent,
    );
    relay.state.subscribe(onRelayStatus);
    relay.connect();
    return () => relay?.disconnect();
  });
</script>

<main>
  {#if user && roomId}
    <h1 class="no-star">Room {roomId} — space</h1>
    <p class="muted">
      Listening as <b>{user.userId}</b>{user.name ? ` (${user.name})` : ""}
      · relay {relayStatus.status}
    </p>

    <p>
      <button type="button" onclick={startBleListen}>Enable BLE listening</button>
      {#if attachedBle.length}
        <button type="button" class="secondary" onclick={stopBleListen}>Stop BLE</button>
      {/if}
    </p>
    <p class="muted">{bleState}</p>
    {#if bleError}<p class="error">{bleError}</p>{/if}

    <fieldset>
      <legend>Peers</legend>
      {#if peers.length === 0}
        <p class="muted">Nobody yet — waiting for claims or advertisements.</p>
      {:else}
        <ul>
          {#each peers as peer (peer.userId + peer.source)}
            <li><code>{peer.userId}</code> via {peer.source}</li>
          {/each}
        </ul>
      {/if}
    </fieldset>

    <fieldset>
      <legend>Event log</legend>
      {#each log as line}
        <p class="muted">{line}</p>
      {/each}
    </fieldset>

    <button type="button" class="secondary" onclick={() => goto("/")}>← Home</button>
  {:else}
    <p class="muted">Redirecting to room login…</p>
  {/if}
</main>
