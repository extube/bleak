<script lang="ts">
  import { onMount } from "svelte";
  import { BlePeripheral } from "@ble-id/ble-plugin";
  import { WRAPPER_SERVICE_UUID } from "@ble-id/shared-types";

  let supported = $state<boolean | null>(null);
  let advertising = $state(false);
  let exchangeCode = $state("");
  let receivedClaims = $state<string[]>([]);
  let log = $state("");

  // The web client claims via relay or direct GATT; both end up calling
  // the same "this ID now advertised" path:
  let advertisedId = $state<string | null>(null);

  onMount(async () => {
    const support = await BlePeripheral.isSupported();
    supported = support.supported && support.peripheralModeAvailable;

    await BlePeripheral.addListener("claimReceived", ({ claim }) => {
      receivedClaims = [claim, ...receivedClaims].slice(0, 20);
      try {
        const parsed = JSON.parse(claim) as { userId?: string };
        if (parsed.userId) advertisedId = parsed.userId;
      } catch {
        // non-JSON payload — ignore
      }
    });

    BlePeripheral.addListener("advertisingStarted", () => (advertising = true));
    BlePeripheral.addListener(
      "advertisingError",
      ({ message }) => (log = `⚠ ${message}`),
    );
  });

  async function start() {
    await BlePeripheral.setActiveExchange({ exchangeCode: exchangeCode.trim().toUpperCase() });
    await BlePeripheral.startAdvertising({ serviceUuid: WRAPPER_SERVICE_UUID });
  }

  async function stop() {
    await BlePeripheral.stopAdvertising();
    advertising = false;
  }

  const canStart = $derived(supported === true && exchangeCode.trim().length >= 4);
</script>

<main>
  <h1>BLE ID Exchange — native</h1>
  <p class="muted">
    Advertiser + listener. Serverless: everything runs over the phone's own radio.
  </p>

  {#if supported === null}
    <p class="muted">checking controller…</p>
  {:else if supported === false}
    <p class="error">
      Peripheral mode unavailable on this handset.
      On iOS this always works (CoreBluetooth); on Android few OEM stacks
      restrict LE advertising — check
      <code>BluetoothAdapter.isMultipleAdvertisementSupported()</code>.
    </p>
  {:else}
    <fieldset>
      <legend>Exchange code (shown/QR to web users)</legend>
      <input bind:value={exchangeCode} maxlength="12" placeholder="8F3K2D" />
      {#if !advertising}
        <button onclick={start} disabled={!canStart}>Start advertising</button>
      {:else}
        <button onclick={stop} class="secondary">Stop</button>
      {/if}
    </fieldset>

    {#if advertising}
      <p>
        Advertising <code>{advertisedId ?? "(awaiting claim)"}</code>
        with code <code>{exchangeCode.trim().toUpperCase()}</code>
      </p>
    {/if}

    <fieldset>
      <legend>Claims received over GATT</legend>
      <ul>
        {#each receivedClaims as claim (claim)}
          <li><code>{claim}</code></li>
        {/each}
        {#if receivedClaims.length === 0}
          <li class="muted">none yet</li>
        {/if}
      </ul>
    </fieldset>

    {#if log}
      <p class="error">{log}</p>
    {/if}
  {/if}
</main>
