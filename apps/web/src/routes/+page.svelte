<script lang="ts">
  import { goto } from "$app/navigation";

  type Burst = {
    x: number;
    y: number;
    delay: number;
    dur: number;
    sparks: { tx: number; ty: number; delay: number; dur: number }[];
  };

  const bursts: Burst[] = Array.from({ length: 5 }, (_, i) => {
    const angleJitter = i * 1.7;
    const sparks = Array.from({ length: 14 }, (_, j) => {
      const angle = (j / 14) * Math.PI * 2 + angleJitter;
      const dist = 46 + ((j * 13) % 38);
      return {
        tx: Math.cos(angle) * dist,
        ty: Math.sin(angle) * dist,
        delay: (j * 0.021) % 0.3,
        dur: 1.5 + ((j * 7) % 5) / 10,
      };
    });
    return {
      x: 12 + ((i * 17 + 29) % 76),
      y: 14 + ((i * 23 + 41) % 62),
      delay: i * 1.9,
      dur: 4.6 + (i % 3),
      sparks,
    };
  });

  const start = () => goto("/start");
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
      stroke="#e6b422"
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
      stroke="#e6b422"
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
  <p class="kicker">ble id exchange</p>
  <h1 class="hero">Scan.<br />Claim.<br />It's yours.</h1>
  <div class="rule" aria-hidden="true"></div>
  <p class="lede">
    Rooms, codes and nearby users — no long words, just scan.
  </p>

  <button class="cta" type="button" onclick={start}>
    Start
    <span class="cta-arrow" aria-hidden="true">→</span>
  </button>

  <p class="note muted">
    Everything listens over the relay, so it works in every mobile browser —
    including iOS Safari.
  </p>

  <div class="ribbon" aria-hidden="true">
    <div class="ribbon-track">
      <span>★ nearby first ★ scan to join ★ one-time codes ★ no passwords ★</span>
      <span>★ nearby first ★ scan to join ★ one-time codes ★ no passwords ★</span>
    </div>
  </div>
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
    background: #e6b422;
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
    padding: 3.5rem 1.25rem 2rem;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    box-sizing: border-box;
  }

  .kicker {
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.35em;
    margin: 0 0 1.1rem;
    opacity: 0.85;
    animation: rise 0.9s ease-out backwards;
  }

  .hero {
    font-size: clamp(2.6rem, 9vw, 4.6rem);
    line-height: 1.02;
    font-weight: 800;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    margin: 0;
    color: var(--ink);
    text-shadow: 0 0 22px rgba(255, 255, 255, 0.25);
    animation: rise 0.9s ease-out 0.12s backwards, glow 3.2s ease-in-out 1s infinite alternate;
  }

  .rule {
    width: 96px;
    height: 4px;
    background: var(--ink);
    margin: 1.4rem 0 1.3rem;
    animation: rise 0.9s ease-out 0.2s backwards, widen 0.9s ease-out 0.2s backwards;
  }

  @keyframes widen {
    from {
      width: 0;
    }
  }

  .lede {
    max-width: 34ch;
    margin: 0 0 2.2rem;
    font-size: 1rem;
    line-height: 1.55;
    animation: rise 0.9s ease-out 0.28s backwards;
  }

  .cta {
    align-self: flex-start;
    padding: 1.05rem 3.2rem;
    font-size: 1.2rem;
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

  .cta:active:not(:disabled) {
    transform: translateY(0);
  }

  .cta::after {
    content: "";
    position: absolute;
    top: 0;
    left: -80%;
    width: 40%;
    height: 100%;
    background: linear-gradient(
      120deg,
      transparent 0%,
      rgba(255, 255, 255, 0.35) 50%,
      transparent 100%
    );
    animation: sheen 3.4s ease-in-out infinite;
  }

  @keyframes sheen {
    0%,
    55% {
      left: -80%;
    }
    75%,
    100% {
      left: 130%;
    }
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

  .note {
    margin-top: 1.6rem;
    max-width: 42ch;
  }

  .ribbon {
    margin-top: 4.5rem;
    border-top: 2px solid var(--ink);
    border-bottom: 2px solid var(--ink);
    padding: 0.5rem 0;
    overflow: hidden;
    white-space: nowrap;
  }

  .ribbon-track {
    display: inline-block;
    animation: marquee 18s linear infinite;
  }

  .ribbon-track span {
    display: inline-block;
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    padding-right: 0.5em;
  }

  @keyframes marquee {
    from {
      transform: translateX(0);
    }
    to {
      transform: translateX(-50%);
    }
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(18px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes glow {
    from {
      text-shadow: 0 0 12px rgba(255, 255, 255, 0.12);
    }
    to {
      text-shadow: 0 0 26px rgba(255, 255, 255, 0.45);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .curve,
    .burst,
    .spark,
    .hero,
    .kicker,
    .rule,
    .lede,
    .cta,
    .cta-arrow,
    .cta::after,
    .ribbon-track {
      animation: none !important;
    }
  }
</style>
