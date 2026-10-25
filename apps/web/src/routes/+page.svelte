<script lang="ts">
  import { goto } from "$app/navigation";

  const start = () => goto("/start");
</script>

<main>
  <h1>BLE ID Exchange</h1>
  <p class="muted">
    Rooms, codes and nearby users — no long words, just scan.
  </p>

  <div class="stars">★ ★ ★</div>

  <button class="big" type="button" onclick={start}>Start</button>

  <p class="muted">
    Everything on this page listens over the relay, so it works in every
    mobile browser — including iOS Safari.
  </p>
</main>

<style>
  .big {
    padding: 1.1rem 3rem;
    font-size: 1.2rem;
  }
</style>
