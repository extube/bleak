<script lang="ts">
  import { onMount } from "svelte";
  import QRCode from "qrcode";
  import { ApiError, createIncome, createRoom, getIncome } from "$lib/api";
  import type { IncomeRecord } from "@ble-id/shared-types";

  let record = $state<IncomeRecord | null>(null);
  let joinUrl = $state("");
  let dataUrl = $state("");
  let error = $state("");
  let copied = $state(false);

  /** /income without a code: create a room + income line on the fly (owner path). */
  async function mintIncome(): Promise<IncomeRecord> {
    const room = await createRoom();
    return createIncome(room.roomId);
  }

  async function draw() {
    if (!record) return;
    joinUrl = `${location.origin}/join?code=${record.tempId}`;
    dataUrl = await QRCode.toDataURL(joinUrl, {
      width: 220,
      margin: 0,
      color: { dark: "#0d0d0d", light: "#fffdf2" },
      errorCorrectionLevel: "M",
    });
  }

  onMount(async () => {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    try {
      record = code ? await getIncome(code) : await mintIncome();
      if (!code) {
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
    copied = true;
    setTimeout(() => (copied = false), 1600);
  }

  function fmt(ms: number): string {
    return new Date(ms).toLocaleString();
  }
</script>

{#if error}
  <main>
    <h1>Income code</h1>
    <p class="error">{error}</p>
    <button type="button" class="secondary" onclick={() => history.back()}>← Back</button>
  </main>
{:else}
  <main>
    <section class="card" aria-busy={!record}>
      {#if record && dataUrl}
        <p class="label">room {record.roomId}</p>
        <div class="qr-wrap">
          <img class="qr" src={dataUrl} alt="Join QR code" width="220" height="220" />
        </div>
        <p class="code">{record.tempId}</p>
        <p class="meta">
          created {fmt(record.createdAt)}<br />
          expires {fmt(record.expiresAt)}
        </p>
        <p class="meta share">
          <code class="link">{joinUrl}</code>
        </p>
        <button type="button" class="secondary copy" class:copied onclick={copyLink}>
          {copied ? "✓ copied" : "copy invite link"}
        </button>
      {:else}
        <p class="meta">minting invitation…</p>
      {/if}
    </section>
  </main>
{/if}

<style>
  .card {
    max-width: 300px;
    margin: 0 auto;
    padding: 2.2rem 1.6rem;
    border: 2px solid var(--ink);
    text-align: center;
  }

  .label {
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.28em;
    margin: 0 0 1.4rem;
  }

  .qr-wrap {
    display: inline-block;
    padding: 10px;
    background: #fffdf2;
    border: 2px solid var(--ink);
  }

  .qr {
    display: block;
  }

  .code {
    font-size: 1.5rem;
    font-weight: 800;
    letter-spacing: 0.25em;
    margin: 1.3rem 0 0.8rem;
  }

  .meta {
    font-size: 0.72rem;
    line-height: 1.7;
    margin: 0.6rem 0 0;
    color: var(--ink-soft);
  }

  .share code {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: bottom;
  }

  .link {
    font-size: 0.72rem;
  }

  .copy {
    margin-top: 1.2rem;
    width: 100%;
  }

  .copy.copied {
    background: var(--ink);
    color: var(--yellow);
  }
</style>
