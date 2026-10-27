<script lang="ts">
  import { onMount } from "svelte";
  import jsQR from "jsqr";

  let video: HTMLVideoElement | undefined = $state();
  let canvas: HTMLCanvasElement | undefined = $state();
  let stream: MediaStream | null = null;
  let rafId = 0;

  let status = $state("Starting camera…");
  let permissionError = $state("");
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
      permissionError = "This browser cannot request the camera from here.";
      return;
    }
    try {
      // The QR flow uses the camera — this is the permission prompt.
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
      permissionError =
        "Camera permission denied or unavailable — use “enter room code” instead.";
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
        status = `QR read, but did not match /join?code=… — got “${found.data.slice(0, 40)}”`;
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
      permissionError = "Room code needs exactly 8 digits.";
    }
  }

  type Burst = {
    x: number;
    y: number;
    delay: number;
    dur: number;
    sparks: { tx: number; ty: number; delay: number; dur: number }[];
  };

  const bursts: Burst[] = Array.from({ length: 3 }, (_, i) => {
    const angleJitter = i * 2.1;
    const sparks = Array.from({ length: 12 }, (_, j) => {
      const angle = (j / 12) * Math.PI * 2 + angleJitter;
      const dist = 44 + ((j * 17) % 34);
      return {
        tx: Math.cos(angle) * dist,
        ty: Math.sin(angle) * dist,
        delay: (j * 0.024) % 0.3,
        dur: 1.6 + ((j * 7) % 5) / 10,
      };
    });
    return {
      x: 18 + ((i * 31 + 13) % 64),
      y: 12 + ((i * 37 + 29) % 70),
      delay: i * 2.3,
      dur: 5.2 + i,
      sparks,
    };
  });

  onMount(() => {
    void startCamera();
    return stopCamera;
  });
</script>

<div class="stage" aria-hidden="true">
  <svg class="curve curve-a" viewBox="0 0 400 400" fill="none">
    <path
      d="M-40 380 C 120 340, 200 220, 180 60 S 320 -80, 420 -20"
      stroke="var(--yellow)"
      stroke-width="2"
      stroke-dasharray="10 14"
    />
    <path
      d="M-40 420 C 150 380, 240 240, 220 80 S 360 -60, 460 0"
      stroke="#f2d027"
      stroke-width="1.5"
      stroke-dasharray="4 10"
    />
    <path
      d="M-60 460 C 180 420, 280 260, 260 100 S 400 -40, 520 20"
      stroke="#ffffff"
      stroke-width="1"
      stroke-dasharray="2 12"
      opacity="0.55"
    />
  </svg>
  <svg class="curve curve-b" viewBox="0 0 400 400" fill="none">
    <path
      d="M420 30 C 280 70, 210 180, 230 330 S 90 470, -20 420"
      stroke="var(--yellow)"
      stroke-width="2"
      stroke-dasharray="10 14"
    />
    <path
      d="M460 -10 C 300 40, 240 160, 260 310 S 100 450, -40 400"
      stroke="#f2d027"
      stroke-width="1.5"
      stroke-dasharray="4 10"
    />
  </svg>

  {#each bursts as burst}
    <div
      class="burst"
      style="left:{burst.x}%; top:{burst.y}%; animation-delay:{burst.delay}s; animation-duration:{burst.dur}s"
    >
      {#each burst.sparks as s}
        <span
          class="spark"
          style="--tx:{s.tx}px; --ty:{s.ty}px; animation-delay:{burst.delay + s.delay}s; animation-duration:{s.dur}s"
        ></span>
      {/each}
    </div>
  {/each}
</div>

<main>
  <header class="top">
    <button
      type="button"
      class="back"
      onclick={() => {
        stopCamera();
        history.back();
      }}
      aria-label="Back">←</button
    >
    <p class="kicker">scan to join</p>
  </header>

  <h1 class="hero">Point. Scan. Join.</h1>
  <div class="rule" aria-hidden="true"></div>

  <p class="status" class:alert={permissionError}>
    {permissionError || status}
  </p>

  <div class="cam-frame">
    <video bind:this={video} muted playsinline></video>
    {#if permissionError}
      <div class="cam-fallback">
        <span class="cam-fallback-star" aria-hidden="true">★</span>
        <p>camera unavailable</p>
        <p class="cam-fallback-sub">use “enter room code” below</p>
      </div>
    {/if}
  </div>

  <canvas bind:this={canvas} hidden></canvas>

  {#if !manualOpen}
    <button type="button" class="cta" onclick={() => (manualOpen = true)}>
      Enter room code
      <span class="cta-arrow" aria-hidden="true">→</span>
    </button>
  {:else}
    <form class="manual" onsubmit={enterCode}>
      <input
        bind:value={manualCode}
        inputmode="numeric"
        maxlength="8"
        placeholder="8-digit room code"
        required
      />
      <button type="submit">Open room</button>
      <button type="button" class="secondary" onclick={() => (manualOpen = false)}>
        Keep scanning
      </button>
    </form>
  {/if}
</main>

<style>
  .stage {
    position: fixed;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 0;
  }

  .curve {
    position: absolute;
    width: 60vmin;
    height: 60vmin;
    opacity: 0.5;
    animation: drift 16s ease-in-out infinite alternate;
  }

  .curve-a {
    top: -14vmin;
    left: -14vmin;
  }

  .curve-b {
    bottom: -14vmin;
    right: -14vmin;
    animation-delay: -8s;
  }

  @keyframes drift {
    from {
      transform: rotate(0deg) scale(1);
    }
    to {
      transform: rotate(8deg) scale(1.06);
    }
  }

  .burst {
    position: absolute;
    width: 0;
    height: 0;
    animation: repop 7s steps(1) infinite;
  }

  @keyframes repop {
    0%,
    100% {
      opacity: 1;
    }
  }

  .spark {
    position: absolute;
    width: 4px;
    height: 4px;
    background: var(--yellow);
    box-shadow: 0 0 6px 0 rgba(230, 180, 34, 0.9);
    opacity: 0;
    transform: translate(0, 0) scale(0.4);
    animation-name: fly;
    animation-timing-function: cubic-bezier(0.16, 0.84, 0.42, 1);
    animation-iteration-count: infinite;
    animation-fill-mode: backwards;
  }

  .spark:nth-child(3n) {
    background: #ffffff;
    box-shadow: 0 0 6px 0 rgba(255, 255, 255, 0.8);
  }

  .spark:nth-child(4n) {
    width: 3px;
    height: 3px;
    background: #f2d027;
  }

  @keyframes fly {
    0% {
      opacity: 0;
      transform: translate(0, 0) scale(0.4);
    }
    6% {
      opacity: 1;
    }
    70% {
      opacity: 0.9;
    }
    100% {
      opacity: 0;
      transform: translate(var(--tx), var(--ty)) scale(1);
    }
  }

  main {
    position: relative;
    z-index: 1;
    max-width: 640px;
    margin: 0 auto;
    padding: 2.5rem 1.25rem 3.5rem;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    box-sizing: border-box;
  }

  .top {
    position: fixed;
    top: 1.1rem;
    left: 50%;
    transform: translateX(-50%);
    width: min(640px - 2.5rem, 100%);
    display: flex;
    align-items: center;
    justify-content: space-between;
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

  .hero {
    font-size: clamp(2rem, 7vw, 3.4rem);
    line-height: 1.05;
    font-weight: 800;
    text-transform: uppercase;
    margin: 1.6rem 0 0;
    animation: rise 0.9s ease-out backwards, glow 3.2s ease-in-out 1s infinite alternate;
  }

  .rule {
    width: 84px;
    height: 4px;
    background: var(--ink);
    margin: 1.2rem auto 1.1rem;
    animation: rise 0.9s ease-out 0.15s backwards, widen 0.9s ease-out 0.15s backwards;
  }

  @keyframes widen {
    from {
      width: 0;
    }
  }

  .status {
    min-height: 1.3em;
    margin: 0 0 1.1rem;
    font-size: 0.9rem;
    opacity: 0.8;
    animation: rise 0.9s ease-out 0.2s backwards;
  }

  .status.alert {
    opacity: 1;
    font-weight: 700;
  }

  .cam-frame {
    position: relative;
    width: min(340px, 82vw);
    aspect-ratio: 1;
    border: 3px solid var(--ink);
    background: #000;
    overflow: hidden;
    margin-bottom: 1.4rem;
    animation: rise 0.9s ease-out 0.3s backwards, frame 2.6s ease-in-out infinite alternate;
  }

  @keyframes frame {
    from {
      box-shadow: 0 0 0 0 rgba(19, 19, 19, 0.35);
    }
    to {
      box-shadow: 6px 6px 0 0 var(--ink);
    }
  }

  video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cam-fallback {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    background: #000;
    color: var(--yellow);
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 0.85rem;
  }

  .cam-fallback-star {
    font-size: 2.2rem;
    animation: pulse 1.8s ease-in-out infinite;
  }

  .cam-fallback-sub {
    font-size: 0.68rem;
    opacity: 0.7;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.45;
    }
  }

  .cta {
    padding: 1rem 2.6rem;
    font-size: 1.05rem;
    border-width: 3px;
    position: relative;
    overflow: hidden;
    animation: rise 0.9s ease-out 0.4s backwards;
    transition: transform 0.18s ease, box-shadow 0.18s ease;
  }

  .cta:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.28), 0 10px 26px rgba(0, 0, 0, 0.35);
  }

  .cta-arrow {
    display: inline-block;
    margin-left: 0.5rem;
    animation: nudge 1.6s ease-in-out infinite;
  }

  @keyframes nudge {
    0%,
    100% {
      transform: translateX(0);
    }
    50% {
      transform: translateX(5px);
    }
  }

  .manual {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.7rem;
    width: min(340px, 82vw);
    animation: rise 0.9s ease-out 0.4s backwards;
  }

  .manual input {
    text-align: center;
    letter-spacing: 0.3em;
    font-weight: 700;
  }

  @media (prefers-reduced-motion: reduce) {
    .curve,
    .burst,
    .spark,
    .hero,
    .rule,
    .status,
    .cta,
    .cta-arrow,
    .cam-frame,
    .cam-fallback-star,
    .manual {
      animation: none !important;
    }
  }
</style>
