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
    <header class="top">
      <button type="button" class="back" onclick={() => history.back()} aria-label="Back">←</button>
      <p class="kicker">invitation</p>
    </header>

    <section class="ticket" aria-busy={!record}>
      <div class="ticket-head">
        <div>
          <p class="label">Room</p>
          <p class="room">{record?.roomId ?? "—"}</p>
        </div>
        <div class="head-right">
          <span class="live-dot" aria-hidden="true"></span>
          <span class="live-label">live</span>
        </div>
      </div>

      <div class="ticket-body">
        {#if record && dataUrl}
          <div class="qr-outer">
            <svg class="corner tl" viewBox="0 0 24 24" aria-hidden="true"><path d="M1 1h9M1 1v9M23 1h-9M23 1v9M1 23h9M1 23v-9M23 23h-9M23 23v-9" stroke="var(--ink)" stroke-width="2"/></svg>
            <div class="qr-wrap">
              <img class="qr" src={dataUrl} alt="Join QR code" width="220" height="220" />
            </div>
          </div>
          <p class="code-row">
            <code class="code">{record.tempId}</code>
          </p>
          <dl class="times">
            <div class="time-entry">
              <dt>created</dt>
              <dd>{fmt(record.createdAt)}</dd>
            </div>
            <div class="time-entry expires">
              <dt>expires</dt>
              <dd>{fmt(record.expiresAt)}</dd>
            </div>
          </dl>
          <p class="meta share">
            <code class="link">{joinUrl}</code>
          </p>
          <button type="button" class="copy" class:copied onclick={copyLink}>
            {copied ? "✓ copied" : "copy invite link"}
          </button>
        {:else}
          <div class="loading">
            <span class="ring" aria-hidden="true"></span>
            <p class="meta">minting invitation…</p>
          </div>
        {/if}
      </div>

      <div class="ticket-foot">
        <span>scan or enter the code to join</span>
        <span>{new Date().getFullYear()}</span>
      </div>
    </section>

    <div class="stripes" aria-hidden="true"></div>
  </main>
{/if}

<style>
  .top {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.6rem;
  }

  .back {
    padding: 0.45rem 0.8rem;
  }

  .kicker {
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.35em;
    margin: 0;
  }

  .ticket {
    border: 3px solid var(--ink);
    background: var(--ink);
    max-width: 420px;
    margin: 0 auto;
    position: relative;
    animation: ticket-in 0.7s cubic-bezier(0.2, 0.9, 0.3, 1.2) backwards;
  }

  @keyframes ticket-in {
    from {
      opacity: 0;
      transform: translateY(26px) rotate(-1.5deg);
    }
    to {
      opacity: 1;
      transform: translateY(0) rotate(0);
    }
  }

  .ticket-head {
    background: var(--ink);
    color: var(--yellow);
    padding: 1rem 1.1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.28em;
    margin: 0 0 0.2rem;
    opacity: 0.8;
  }

  .room {
    font-weight: 800;
    letter-spacing: 0.08em;
    margin: 0;
  }

  .head-right {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .live-dot {
    width: 9px;
    height: 9px;
    background: var(--yellow);
    display: inline-block;
    animation: pulse 1.4s ease-in-out infinite;
  }

  .live-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.2em;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
      box-shadow: 0 0 0 0 rgba(230, 180, 34, 0.7);
    }
    50% {
      opacity: 0.55;
      box-shadow: 0 0 0 7px rgba(230, 180, 34, 0);
    }
  }

  .ticket-body {
    background: var(--yellow);
    padding: 1.4rem 1.25rem 1.6rem;
    text-align: center;
    border-top: 3px dashed var(--ink);
    border-bottom: 3px dashed var(--ink);
  }

  .qr-outer {
    position: relative;
    display: inline-block;
    padding: 12px;
  }

  .qr-wrap {
    display: inline-block;
    padding: 16px;
    background: #fffdf2;
    border: 2px solid var(--ink);
    animation: frame 2.6s ease-in-out infinite alternate;
  }

  @keyframes frame {
    from {
      box-shadow: 0 0 0 0 rgba(19, 19, 19, 0.35);
    }
    to {
      box-shadow: 6px 6px 0 0 var(--ink);
    }
  }

  .corner {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 4px;
    box-sizing: border-box;
    animation: corner-blink 1.8s steps(1) infinite;
  }

  @keyframes corner-blink {
    0%,
    100% {
      opacity: 0.9;
    }
    50% {
      opacity: 0;
    }
  }

  .qr {
    display: block;
  }

  .code-row {
    margin: 1.1rem 0 0.3rem;
  }

  .code {
    font-size: 2rem;
    font-weight: 800;
    letter-spacing: 0.25em;
    background: var(--ink);
    color: var(--yellow);
    padding: 0.35rem 0.9rem 0.35rem 1.15rem;
    display: inline-block;
    text-underline-offset: 0.2em;
    animation: code-in 0.8s cubic-bezier(0.2, 0.9, 0.3, 1.2) backwards;
    animation-delay: 0.25s;
  }

  @keyframes code-in {
    from {
      opacity: 0;
      transform: scale(0.75);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .meta {
    font-size: 0.78rem;
    margin: 0.45rem 0;
    color: var(--ink);
  }

  .times {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 0.65rem;
    row-gap: 0.4rem;
    max-width: 300px;
    margin: 1.2rem auto 0.4rem;
    padding: 0.7rem 0.85rem;
    border: 2px solid var(--ink);
    background: #fffdf2;
    text-align: left;
  }

  .times dt {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.24em;
    color: var(--ink);
    opacity: 0.72;
    padding-top: 0.2em;
  }

  .times dd {
    margin: 0;
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--ink-soft);
  }

  .time-entry {
    display: contents;
  }

  .time-entry.expires dt::after {
    content: " ✦";
    color: var(--ink);
    opacity: 1;
  }

  .time-entry.expires dd {
    color: var(--ink);
  }

  .share code {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: bottom;
  }

  .link {
    font-size: 0.75rem;
  }

  .copy {
    margin-top: 0.9rem;
    width: 100%;
    transition: background 0.2s ease, color 0.2s ease;
  }

  .copy.copied {
    background: #fff;
    color: var(--ink);
  }

  .loading {
    padding: 2.6rem 0 3rem;
  }

  .ring {
    display: inline-block;
    width: 34px;
    height: 34px;
    border: 3px solid var(--ink);
    border-right-color: transparent !important;
    border-bottom-color: transparent !important;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .ticket-foot {
    background: var(--ink);
    color: var(--yellow);
    padding: 0.6rem 1.1rem;
    display: flex;
    justify-content: space-between;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.22em;
  }

  .stripes {
    max-width: 420px;
    height: 12px;
    margin: 0.9rem auto 0;
    background: repeating-linear-gradient(
      -45deg,
      var(--ink) 0 10px,
      var(--yellow) 10px 20px,
      #fff 20px 30px,
      var(--yellow) 30px 40px
    );
    animation: slide 1.2s linear infinite;
    background-size: 56.57px 100%;
  }

  @keyframes slide {
    to {
      background-position: 56.57px 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ticket,
    .ticket-head,
    .code,
    .qr-wrap,
    .corner,
    .live-dot,
    .stripes {
      animation: none !important;
    }
  }
</style>
