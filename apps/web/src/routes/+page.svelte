<script lang="ts">
  import { onMount } from "svelte";
  import { getOrCreateIdentity, type Identity } from "$lib/identity";
  import { createRelay, type Relay, type RelayState, type IdRecord } from "$lib/relay";
  import type { ClaimResult } from "@ble-id/shared-types";

  const relay: Relay = createRelay(
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
  );

  let identity: Identity = $state({ userId: "…", token: "" });
  let exchangeCode = $state("");
  let submitError = $state("");
  let shareFallback = $state("");

  let claims: IdRecord[] = $state([]);
  let claimResults: ClaimResult[] = $state([]);
  let status = $state<RelayState>({ status: "idle" });

  const statusLabels: Record<string, string> = {
    idle: "not connected",
    connecting: "connecting…",
    open: "live",
    closed: "reconnecting…",
    error: "connection error — retrying",
  };

  onMount(() => {
    identity = getOrCreateIdentity();

    relay.connect();

    // Subscribe the stores into typed local state so this component stays
    // entirely in runes-land (Svelte 5 style, no $store sugar).
    relay.state.subscribe((s) => (status = s));
    relay.claims.subscribe((c) => (claims = c));
    relay.claimResults.subscribe((r) => (claimResults = r));

    return () => relay.disconnect();
  });

  const latestResult = $derived(claimResults[0]);

  function submit(event: SubmitEvent) {
    event.preventDefault();
    submitError = "";
    const code = exchangeCode.trim().toUpperCase();
    if (code.length < 4) {
      submitError =
        "Code looks too short — get the exchange code from the nearby user's screen.";
      return;
    }
    relay.submitClaim(identity.userId, identity.token, code);
  }

  async function shareMyId() {
    const url = `${location.origin}/#${identity.userId}`;
    shareFallback = "";
    try {
      if (navigator.share) {
        await navigator.share({
          title: "My BLE ID",
          text: `My ID: ${identity.userId}`,
          url,
        });
        return;
      }
      throw new Error("no-web-share");
    } catch (err) {
      if (err instanceof Error && err.message !== "no-web-share") return; // user cancelled
      await navigator.clipboard.writeText(url);
      shareFallback = "Share sheet unavailable — link copied instead";
    }
  }

  const myTokenPreview = $derived(
    identity.token ? identity.token.slice(0, 4) + "…" : "",
  );
</script>

<main>
  <h1>BLE ID Exchange</h1>
  <p class="muted">
    This web client discovers nearby users through the relay server, so it works in
    every mobile browser — including iOS Safari, which cannot use Bluetooth
    directly.
  </p>
  <p class="muted">
    Relay: <b>{statusLabels[status.status] ?? status.status}</b>
    · you are <b>{identity.userId}</b>
    {#if myTokenPreview}
      <span class="muted">(token {myTokenPreview})</span>
    {/if}
  </p>

  <fieldset>
    <legend>Claim a nearby user's ID</legend>
    <form onsubmit={submit}>
      <input
        bind:value={exchangeCode}
        placeholder="Exchange code shown on the other device (e.g. 8F3K2D)"
        maxlength="12"
        required
      />
      <button type="submit" disabled={status.status !== "open"}>Claim ID</button>
      <p class="error">
        {submitError ||
          (latestResult?.ok === false
            ? `Last attempt rejected: ${latestResult.reason}`
            : "")}
      </p>
    </form>
    <ul>
      {#each claims as claim (claim.claimedAt)}
        <li><code>{claim.userId}</code> claimed via code {claim.exchangeCode}</li>
      {/each}
      {#if claims.length === 0}
        <li class="muted">No claimed IDs yet.</li>
      {/if}
    </ul>
  </fieldset>

  <fieldset>
    <legend>Share your ID</legend>
    <button onclick={shareMyId}>Share {identity.userId} via link / share sheet</button>
    <p class="muted">{shareFallback}</p>
  </fieldset>

  <fieldset>
    <legend>How it works</legend>
    <ol>
      <li>A working nearby wrapper displays an <b>exchange code</b> and BLE-advertises it.</li>
      <li>
        You enter that code here, and your ID + a one-time token is posted via the
        relay.
      </li>
      <li>The wrapper captures it, verifies, and starts advertising your ID.</li>
    </ol>
    <p class="muted">
      Protocol types:
      <code>packages/shared-types</code> · server: <code>apps/server</code>
    </p>
  </fieldset>
</main>
