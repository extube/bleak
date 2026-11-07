<script lang="ts">
  import { onMount } from "svelte";
  import { ApiError, getIncome } from "$lib/api";
  import { goto } from "$app/navigation";

  let status = $state("Resolving room from code…");
  let error = $state("");

  onMount(async () => {
    const params = new URLSearchParams(location.search);
    const code = params.get("code") ?? "";
    if (!/^[0-9]{8}$/.test(code)) {
      error = "Missing or malformed ?code=  (expected 8 digits).";
      return;
    }
    try {
      const income = await getIncome(code);
      if (income.deleted) {
        error = "This room code has been revoked.";
        return;
      }
      status = `Room ${income.roomId} found — opening login…`;
      await goto(`/room/${income.roomId}/login`, { replaceState: true });
    } catch (err) {
      if (err instanceof ApiError) {
        error =
          err.status === 404
            ? "Room code not found — it may have expired or been revoked."
            : err.status === 410
              ? "Room code expired — ask for a fresh one."
              : `Server error: ${err.message}`;
      } else {
        error = String(err);
      }
    }
  });
</script>

<main>
  <h1>Join</h1>
  {#if error}
    <p class="error">{error}</p>
    <button type="button" class="secondary" onclick={() => goto("/start")}>
      ← Back to scanning
    </button>
  {:else}
    <p class="muted">{status}</p>
  {/if}
</main>
