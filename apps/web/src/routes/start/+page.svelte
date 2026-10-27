<script lang="ts">
  import { onMount } from "svelte";
  import jsQR from "jsqr";

  let video: HTMLVideoElement | undefined = $state();
  let canvas: HTMLCanvasElement | undefined = $state();
  let stream: MediaStream | null = null;
  let rafId = 0;

  let status = $state("Starting camera…");
  let cameraError = $state(false);
  let manualOpen = $state(false);
  let manualCode = $state("");

  const CODE_URL = /\/join\?code=([0-9]{8})/;

  /** Accepts a bare 8-digit code or a full /join?code=… URL. */
  function handleCode(text: string): boolean {
    const match = text.match(CODE_URL);
    if (match) {
      stopCamera();
      location.href = `/join?code=${match[1]}`;
      return true;
    }
    if (/^[0-9]{8}$/.test(text)) {
      stopCamera();
      location.href = `/join?code=${text}`;
      return true;
    }
    return false;
  }

  function stopCamera() {
    cancelAnimationFrame(rafId);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  async function startCamera() {
    const media = navigator.mediaDevices;
    if (!media?.getUserMedia) {
      cameraError = true;
      manualOpen = true;
      return;
    }
    try {
      stream = await media.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      if (video) {
        video.srcObject = stream;
        await video.play();
        status = "Point at a QR code…";
        scanLoop();
      }
    } catch (err) {
      cameraError = true;
      manualOpen = true;
      void err;
    }
  }

  let warnedTooFast = 0;

  function scanLoop() {
    rafId = requestAnimationFrame(() => {
      if (!video || !canvas || !stream) return;
      if (video.readyState !== video.HAVE_ENOUGH_DATA) {
        scanLoop();
        return;
      }
      const { videoWidth, videoHeight } = video;
      if (!videoWidth || !videoHeight) {
        scanLoop();
        return;
      }
      canvas.width = videoWidth;
      canvas.height = videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const found = jsQR(image.data, canvas.width, canvas.height);
      if (found?.data) {
        if (handleCode(found.data)) return;
        warnedTooFast = Date.now();
        status = `QR read, but not an invite — ${found.data.slice(0, 40)}`;
      } else {
        if (Date.now() - warnedTooFast > 3000) status = "Point at a QR code…";
      }
      scanLoop();
    });
  }

  function enterCode(event: SubmitEvent) {
    event.preventDefault();
    const code = manualCode.trim();
    if (/^[0-9]{8}$/.test(code)) {
      stopCamera();
      location.href = `/join?code=${code}`;
    } else {
      status = "Room code needs exactly 8 digits.";
    }
  }

  onMount(() => {
    void startCamera();
    return stopCamera;
  });
</script>

<div class="view" class:no-cam={cameraError}>
  <video bind:this={video} muted playsinline></video>
  <canvas bind:this={canvas} hidden></canvas>

  <svg class="corners" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <path
      d="M2 16 V4 Q2 2 4 2 H16 M84 2 H96 Q98 2 98 4 V16 M98 84 V96 Q98 98 96 98 H84 M16 98 H4 Q2 98 2 96 V84"
      stroke="rgba(255,255,255,0.5)"
      stroke-width="1.5"
      fill="none"
    />
  </svg>

  {#if cameraError}
    <p class="alert">This browser cannot request the camera from here.</p>
  {/if}
  <p class="status">{status}</p>
</div>

<footer class="dock">
  <button
    type="button"
    class="back"
    onclick={() => {
      stopCamera();
      history.back();
    }}
    aria-label="Back">←</button
  >

  {#if !manualOpen}
    <button type="button" class="enter" onclick={() => (manualOpen = true)}>Enter room code</button>
  {:else}
    <form class="manual" onsubmit={enterCode}>
      <input
        bind:value={manualCode}
        inputmode="numeric"
        maxlength="8"
        placeholder="8-digit code"
        required
      />
      <button type="submit">Open</button>
      {#if !cameraError}
        <button type="button" class="secondary" onclick={() => (manualOpen = false)}>Scan</button>
      {/if}
    </form>
  {/if}
</footer>

<style>
  .view {
    position: fixed;
    inset: 0;
    background: #000;
    overflow: hidden;
  }

  .view.no-cam video {
    visibility: hidden;
  }

  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .corners {
    position: absolute;
    inset: 0;
    margin: auto;
    width: min(76vmin, calc(100% - 3rem));
    height: min(76vmin, calc(100% - 6.5rem));
    max-width: 100%;
    max-height: 100%;
    overflow: visible;
  }

  .alert {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    transform: translateY(-50%);
    margin: 0;
    padding: 0 2rem;
    color: var(--yellow);
    font-weight: 700;
    text-align: center;
    letter-spacing: 0.06em;
  }

  .status {
    position: absolute;
    top: calc(1rem + env(safe-area-inset-top));
    left: 0;
    right: 0;
    margin: 0;
    color: #fff;
    opacity: 0.55;
    font-size: 0.8rem;
    text-align: center;
    pointer-events: none;
  }

  .dock {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 2;
    background: var(--yellow);
    border-top: 3px solid var(--ink);
    padding: 0.9rem calc(1rem + env(safe-area-inset-left)) 0.9rem calc(1rem + env(safe-area-inset-right));
    padding-bottom: calc(0.9rem + env(safe-area-inset-bottom));
    display: flex;
    align-items: center;
    gap: 0.8rem;
    min-height: 4.4rem;
    box-sizing: border-box;
  }

  .back {
    flex: none;
    padding: 0.55rem 0.9rem;
  }

  .enter,
  .manual {
    flex: 1;
  }

  .enter {
    width: 100%;
    padding: 0.85rem 1rem;
  }

  .manual {
    display: flex;
    gap: 0.6rem;
  }

  .manual input {
    flex: 1;
    min-width: 0;
    text-align: center;
    letter-spacing: 0.2em;
    font-weight: 700;
  }

  @media (prefers-reduced-motion: reduce) {
    .view,
    .dock {
      animation: none !important;
    }
  }
</style>
