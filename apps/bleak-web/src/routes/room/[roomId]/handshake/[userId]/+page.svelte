<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { ApiError, createHandshake, getShareProfile } from "$lib/api";
  import { getRoomUser } from "$lib/roomUser";

  const roomId = $derived(page.params.roomId ?? "");
  const hostId = $derived(page.params.userId ?? "");
  const me = $derived(getRoomUser(roomId));

  /** Landing lifecycle: working → done | self | no-login | error. */
  let landing = $state("working");
  let hostName = $state("");
  let error = $state("");

  function toProfile() {
    goto(`/room/${roomId}/user/${hostId}`);
  }

  onMount(async () => {
    if (!roomId || !hostId) goto("/", { replaceState: true });
    if (!me) {
      // Park the handshake so the room login can land it after entry.
      sessionStorage.setItem(
        "ble-id-pending-handshake",
        JSON.stringify({ roomId, fromUser: hostId }),
      );
      landing = "no-login";
      return;
    }
    if (hostId === me.userId) {
      landing = "self";
      return;
    }
    try {
      const profile = await getShareProfile(roomId, hostId);
      hostName = profile.name;
    } catch {
      // Host profile details are decorative only.
    }
    try {
      await createHandshake(roomId, hostId, me.userId);
      landing = "done";
      setTimeout(toProfile, 700);
    } catch (err) {
      error = err instanceof ApiError ? err.message : String(err);
      landing = "error";
    }
  });
</script>

<svelte:head>
  <title>handshake — room {roomId}</title>
</svelte:head>

<div class="frame">
  <header>
    <button type="button" class="back" aria-label="back" onclick={() => history.back()}>←</button>
    <span class="room-id">room {roomId}</span>
  </header>

  <main>
    <fieldset class="panel">
      <legend>handshake</legend>
      {#if landing === "working"}
        <p class="soft">opening handshake…</p>
      {:else if landing === "self"}
        <p>that is your own handshake qr</p>
      {:else if landing === "no-login"}
        <p class="quote">
          you are not in this room yet —{#if hostName}&nbsp;with {hostName}{/if} waiting for you there
        </p>
        <button type="button" class="wide" onclick={() => goto(`/room/${roomId}/login`)}>
          enter the room
        </button>
      {:else if landing === "done"}
        <p class="quote">
          handshake saved{#if hostName}&nbsp;— {hostName} is now in your contacts{/if}
        </p>
      {:else if landing === "error"}
        <p class="soft error">{error}</p>
      {/if}
    </fieldset>
  </main>
</div>

<style>
  .frame {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  header {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    padding: 0.8rem 1.25rem;
    border-bottom: 2px solid var(--ink);
  }

  .back {
    width: 3.2rem;
    height: 3.2rem;
    line-height: 1;
    padding: 0;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .room-id {
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  main {
    flex: 1;
    width: 100%;
    max-width: 480px;
    margin: 0 auto;
    padding: 1.5rem 1.25rem 2rem;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  fieldset.panel {
    border: 2px solid var(--ink);
    border-radius: 0.7rem;
    padding: 0.6rem 0.75rem 0.75rem;
  }

  fieldset.panel legend {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.85rem;
    font-weight: 700;
    padding: 0 0.4rem;
    background: var(--yellow);
  }

  .quote {
    font-weight: 700;
    margin: 0.4rem 0 0.8rem;
  }

  .wide {
    width: 100%;
    height: 3.2rem;
    box-sizing: border-box;
  }

  .soft {
    opacity: 0.75;
  }

  .error {
    font-weight: 700;
    opacity: 1;
  }
</style>
