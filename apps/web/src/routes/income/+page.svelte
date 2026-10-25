<script lang="ts">
  import { onMount } from "svelte";
  import QRCode from "qrcode";
  import { ApiError, createIncome, createRoom, getIncome } from "$lib/api";
  import type { IncomeRecord } from "@ble-id/shared-types";

  let record = $state<IncomeRecord | null>(null);
  let joinUrl = $state("");
  let dataUrl = $state("");
  let error = $state("");

  /** /income without a code: create a room + income line on the fly (owner path). */
  async function mintIncome(): Promise<IncomeRecord> {
    const room = await createRoom();
    return createIncome(room.roomId);
  }

  async function draw() {
    if (!record) return;
    joinUrl = `${location.origin}/join?code=${record.tempId}`;
    dataUrl = await QRCode.toDataURL(joinUrl, {
      width: 320,
      margin: 0,
      // Two hard colours only — fits the solid yellow/black style.
      color: { dark: "#131313", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });
  }

  onMount(async () => {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    try {
      record = code ? await getIncome(code) : await mintIncome();
      if (!code) {
        // keep the URL shareable/refresh-proof
        history.replaceState(history.state, "", `/income?code=${record.tempId}`);
      }
      await draw();
    } catch (err) {
      if (err instanceof ApiError) {
        error =
          err.status === 404
            ? "Room code not found — it may have expired or been revoked."
            : err.status === 410
              ? "Room code expired or deleted — mint a fresh one."
              : `Server error: ${err.message}`;
      } else {
        error = String(err);
      }
    }
  });

  async function copyLink() {
    await navigator.clipboard.writeText(joinUrl);
    error = "";
  }

  function fmt(ms: number): string {
    return new Date(ms).toLocaleString();
  }
</script>

<main>
  <h1>Income code</h1>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  {#if record}
    <p class="muted">
      Room <b>{record.roomId}</b> · code <code>{record.tempId}</code>
      <br />
      created {fmt(record.createdAt)} · expires {fmt(record.expiresAt)}
    </p>

    {#if dataUrl}
      <p class="qr-box"><img src={dataUrl} alt="Join QR code" width="320" height="320" /></p>
    {/if}

    <p class="muted">
      The QR encodes <code>{joinUrl}</code>
    </p>

    <button type="button" class="secondary" onclick={copyLink}>Copy invite link</button>

    <p>
      <button type="button" class="secondary" onclick={() => history.back()}>
        ← Back
      </button>
    </p>
  {:else if !error}
    <p class="muted">Loading…</p>
  {/if}
</main>
