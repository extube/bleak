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
  let codeCopied = $state(false);

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

  async function copyCode() {
    if (!record) return;
    await navigator.clipboard.writeText(record.tempId);
    codeCopied = true;
    setTimeout(() => (codeCopied = false), 1600);
  }

  function fmtDate(ms: number): string {
    return new Date(ms)
      .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
      .toLowerCase();
  }

  function fmtTime(ms: number): string {
    return new Date(ms).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
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
        <p class="label">room {record.roomId} <span class="live-dot" aria-hidden="true"></span></p>
        <div class="qr-wrap">
          <img class="qr" src={dataUrl} alt="Join QR code" width="220" height="220" />
        </div>
        <button type="button" class="code" title="copy code" onclick={copyCode}>
          {codeCopied ? "✓ copied" : record.tempId}
        </button>
        <dl class="times">
          <div class="time-block">
            <dt>start</dt>
            <dd class="date">{fmtDate(record.createdAt)}</dd>
            <dd class="time">{fmtTime(record.createdAt)}</dd>
          </div>
          <div class="time-block">
            <dt>expires</dt>
            <dd class="date">{fmtDate(record.expiresAt)}</dd>
            <dd class="time">{fmtTime(record.expiresAt)}</dd>
          </div>
        </dl>
        <button type="button" class="secondary copy" class:copied onclick={copyLink}>
          {copied ? "✓ copied" : "copy invite link"}
        </button>
      {:else}
        <p class="meta">minting invitation…</p>
      {/if}
    </section>

    <div class="stripes" aria-hidden="true"></div>
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

  .live-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    background: var(--ink);
    vertical-align: 0.1em;
    margin-left: 0.45em;
    animation: pulse 1.4s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.25;
    }
  }

  .stripes {
    max-width: 320px;
    height: 8px;
    margin: 1.4rem auto 0;
    background: repeating-linear-gradient(
      -45deg,
      var(--ink) 0 8px,
      var(--yellow) 8px 16px,
      #fffdf2 16px 24px,
      var(--yellow) 24px 32px
    );
    animation: slide 1.2s linear infinite;
    background-size: 45.25px 100%;
  }

  @keyframes slide {
    to {
      background-position: 45.25px 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .live-dot,
    .stripes {
      animation: none !important;
    }
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
    display: inline-block;
    font-size: 1.5rem;
    font-weight: 800;
    letter-spacing: 0.25em;
    margin: 1.3rem 0 0.8rem;
    background: none;
    border: none;
    color: var(--ink);
    padding: 0;
  }

  .code:hover {
    text-decoration: underline;
    text-underline-offset: 0.2em;
    text-decoration-thickness: 2px;
  }

  .times {
    display: grid;
    grid-template-columns: 1fr 1fr;
    margin: 0.4rem 0 0;
    border-top: 1px solid var(--ink-soft);
  }

  .time-block {
    padding: 0.85rem 0.2rem 0;
    text-align: center;
  }

  .time-block:first-child {
    border-right: 1px solid var(--ink-soft);
  }

  .time-block dt {
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.28em;
    color: var(--ink);
    opacity: 0.65;
  }

  .time-block dd.date {
    font-size: 0.95rem;
    font-weight: 800;
    margin: 0.35rem 0 0.15rem;
    letter-spacing: 0.06em;
  }

  .time-block dd.time {
    font-size: 0.82rem;
    font-weight: 700;
    margin: 0;
    color: var(--ink-soft);
  }

  .copy {
    margin-top: 1.2rem;
    width: 100%;
  }

  .meta {
    font-size: 0.72rem;
    line-height: 1.7;
    margin: 0.6rem 0 0;
    color: var(--ink-soft);
  }

  .copy.copied {
    background: var(--ink);
    color: var(--yellow);
  }
</style>
