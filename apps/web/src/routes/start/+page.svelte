<script lang="ts">
  import { onMount } from "svelte";
  import jsQR from "jsqr";

  let video: HTMLVideoElement | undefined = $state();
  let canvas: HTMLCanvasElement | undefined = $state();
  let stream: MediaStream | null = null;
  let rafId = 0;

  let status = $state("Starting camera…");
  let cameraError = $state(false);

  const CODE_URL = /\/join\?code=([0-9]{8})/;
  const HANDSHAKE_URL = /\/room\/([^/\s#?]+)\/handshake\/([A-Za-z0-9_-]{1,32})/;

  /** Accepts a bare 8-digit code, a /join?code= URL, or a handshake link. */
  function handleCode(text: string): boolean {
    const handshake = text.match(HANDSHAKE_URL);
    if (handshake) {
      stopCamera();
      location.href = `/room/${handshake[1]}/handshake/${handshake[2]}`;
      return true;
    }
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

  onMount(() => {
    void startCamera();
    return () => {
      stopCamera();
    };
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
    position: absolute;
    inset: 0;
    width: 100%;
    max-width: none;
    height: 100%;
    aspect-ratio: auto;
    object-fit: cover;
    display: block;
    border: none;
  }

  .corners {
    position: absolute;
    inset: 0;
    margin: auto;
    width: min(220px, 76vmin, calc(100% - 3rem));
    height: min(220px, 76vmin, calc(100% - 6.5rem));
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
    height: 3.2rem;
    padding: 0 0.9rem;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
  }

  @media (prefers-reduced-motion: reduce) {
    .view,
    .dock {
      animation: none !important;
    }
  }
</style>
