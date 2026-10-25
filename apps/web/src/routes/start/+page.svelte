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

  onMount(() => {
    void startCamera();
    return stopCamera;
  });
</script>

<main>
  <button
    type="button"
    class="secondary"
    onclick={() => {
      stopCamera();
      history.back();
    }}
  >← Back</button>

  <h1>Scan the room QR</h1>
  {#if permissionError}
    <p class="error">{permissionError}</p>
  {:else}
    <p class="muted">{status}</p>
  {/if}

  <video bind:this={video} muted playsinline></video>
  <canvas bind:this={canvas} hidden></canvas>

  {#if !manualOpen}
    <button type="button" class="secondary" onclick={() => (manualOpen = true)}>
      Enter room code
    </button>
  {:else}
    <form onsubmit={enterCode}>
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
