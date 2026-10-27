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
  const bleUnavailable = $derived(bleState === "BLE unavailable");

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
    // Attempt BLE listening right away — Chrome needs a user gesture for the
    // device picker, so this may no-op; the manual button remains for that.
    void startBleListen();
    return () => relay?.disconnect();
  });
</script>

<svelte:head>
  <title>space — room {roomId}</title>
</svelte:head>

<div class="frame">
  <header>
    <button
      type="button"
      class="back"
      aria-label="back"
      onclick={() => history.back()}
    >
      ←
    </button>
    <span class="room-id">room {roomId}</span>
    <span class="header-spacer"></span>
  </header>

  <main>
    {#if user && roomId}
      <fieldset class="panel">
        <legend>identity</legend>
        <p class="row">
          listening as <code>{user.userId}</code>
          {#if user.name}<span class="soft">({user.name})</span>{/if}
        </p>
        <p class="row soft">relay {relayStatus.status}</p>
      </fieldset>

      {#if bleUnavailable}
        <fieldset class="panel">
          <legend>peers</legend>
          <p class="soft">nobody yet — peers will appear here</p>
        </fieldset>
      {:else}
        <fieldset class="panel">
          <legend>ble</legend>
          {#if attachedBle.length}
            <button type="button" class="secondary" onclick={stopBleListen}>
              stop ble listening
            </button>
          {:else}
            <button type="button" onclick={startBleListen}>enable ble listening</button>
          {/if}
          <p class="row soft">{bleState}</p>
          {#if bleError}
            <p class="row error">{bleError}</p>
          {/if}
        </fieldset>

        <fieldset class="panel">
          <legend>peers</legend>
          {#if peers.length === 0}
            <p class="soft">nobody yet — waiting for claims or advertisements</p>
          {:else}
            <ul>
              {#each peers as peer (peer.userId + peer.source)}
                <li><code>{peer.userId}</code> via {peer.source}</li>
              {/each}
            </ul>
          {/if}
        </fieldset>

        <fieldset class="panel">
          <legend>event log</legend>
          {#each log as line}
            <p class="soft">{line}</p>
          {/each}
        </fieldset>
      {/if}
    {:else}
      <p class="soft">redirecting to room login…</p>
    {/if}
  </main>

  <footer>
    {#if user && roomId}
      {#if bleUnavailable}
        <p class="footer-alert">
          mobile app in the works — it will bring full ble functionality here
        </p>
      {:else if attachedBle.length}
        <button type="button" onclick={stopBleListen} class="wide">
          stop ble listening
        </button>
      {:else}
        <button type="button" onclick={startBleListen} class="wide">
          enable ble listening
        </button>
      {/if}
    {/if}
  </footer>
</div>

<style>
  .frame {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  header {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    padding: 0.8rem 1.25rem;
    border-bottom: 2px solid var(--ink);
  }

  .back {
    width: 3.2rem;
    height: 3.2rem;
    line-height: 1;
    padding: 0;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .room-id {
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .header-spacer {
    flex: 1;
  }

  main {
    flex: 1;
    width: 100%;
    max-width: 480px;
    margin: 0 auto;
    padding: 1.5rem 1.25rem 2rem;
    box-sizing: border-box;
  }

  fieldset.panel {
    border: 2px solid var(--ink);
    border-radius: 0.7rem;
    padding: 0.6rem 0.75rem 0.4rem;
    margin-bottom: 1rem;
  }

  fieldset.panel legend {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.85rem;
    font-weight: 700;
    padding: 0 0.4rem;
    background: var(--yellow);
  }

  fieldset.panel .row {
    margin: 0 0 0.4rem;
  }

  .wide {
    width: 100%;
    box-sizing: border-box;
  }

  .soft {
    opacity: 0.75;
    margin: 0.35rem 0;
  }

  footer {
    position: sticky;
    bottom: 0;
    background: var(--yellow);
    border-top: 2px solid var(--ink);
    padding: 0.8rem 1.25rem;
    padding-bottom: calc(0.8rem + env(safe-area-inset-bottom));
  }

  footer .wide {
    height: 3.2rem;
  }

  .footer-alert {
    margin: 0;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    font-size: 0.85rem;
  }

  .error {
    font-weight: 700;
  }
</style>
