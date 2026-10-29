<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import type { ShareProfile } from "@ble-id/shared-types";
  import { getRoomUser } from "$lib/roomUser";
  import { ApiError, getShareProfile, setHandshakeStatus } from "$lib/api";

  const roomId = $derived(page.params.roomId ?? "");
  const peerId = $derived(page.params.userId ?? "");
  const me = $derived(getRoomUser(roomId));

  let profile = $state<ShareProfile | null>(null);
  let busy = $state(false);
  let error = $state("");

  async function load() {
    if (!roomId || !peerId) return;
    try {
      profile = await getShareProfile(roomId, peerId, me?.userId);
      error = "";
    } catch (err) {
      error = err instanceof ApiError ? (err.status === 404 ? "no such user here" : err.message) : String(err);
    }
  }

  async function offerFriendship() {
    if (!profile?.handshake || !me) return;
    busy = true;
    try {
      await setHandshakeStatus(roomId, profile.handshake.id, me.userId, "friend");
      await load();
    } catch (err) {
      error = err instanceof ApiError ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    if (!me) {
      goto(`/room/${roomId}/login`, { replaceState: true });
      return undefined;
    }
    if (peerId === me.userId) goto(`/room/${roomId}/space`, { replaceState: true });
    void load();
    return undefined;
  });
</script>

<svelte:head>
  <title>{profile?.name || peerId} — room {roomId}</title>
</svelte:head>

<div class="frame">
  <header>
    <button type="button" class="back" aria-label="back" onclick={() => history.back()}>←</button>
    <span class="room-id">{profile?.name || peerId}</span>
  </header>

  <main>
    {#if error && !profile}
      <p class="soft">{error}</p>
    {:else if profile}
      <fieldset class="panel">
        <legend>identity</legend>
        <p class="row"><code>{profile.userId}</code></p>
        {#if profile.handshake}
          <p class="row soft">
            {#if profile.handshake.friends}
              mutual friends
            {:else if profile.handshake.mine === "friend"}
              you offered friendship
            {:else if profile.handshake.theirs === "friend"}
              they offered friendship
            {:else}
              in contacts
            {/if}
          </p>
        {/if}
      </fieldset>

      {#if profile.handshake && profile.handshake.mine !== "friend"}
        <button type="button" class="wide" disabled={busy} onclick={offerFriendship}>
          offer friendship
        </button>
      {/if}

      <fieldset class="panel">
        <legend>public bio</legend>
        {#if profile.publicBio}
          <p class="row">{profile.publicBio}</p>
        {:else}
          <p class="row soft">— nothing shared —</p>
        {/if}
      </fieldset>

      <fieldset class="panel">
        <legend>private bio {#if !profile.handshake?.friends}<span class="lock-note">unlocked for mutual friends</span>{/if}</legend>
        {#if profile.privateBio}
          <p class="row">{profile.privateBio}</p>
        {:else}
          <p class="row soft">
            {profile.handshake
              ? "sealed until you both offer friendship"
              : "visible only to mutual friends"}
          </p>
        {/if}
      </fieldset>
    {/if}
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
    letter-spacing: 0.06em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  main {
    flex: 1;
    width: 100%;
    max-width: 480px;
    margin: 0 auto;
    padding: 1.5rem 1.25rem 2rem;
    box-sizing: border-box;
  }

  fieldset.panel {
    border: 2px solid var(--ink);
    border-radius: 0.7rem;
    padding: 0.6rem 0.75rem 0.4rem;
    margin-bottom: 1rem;
  }

  fieldset.panel legend {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.85rem;
    font-weight: 700;
    padding: 0 0.4rem;
    background: var(--yellow);
  }

  fieldset.panel .row {
    margin: 0 0 0.4rem;
  }

  .wide {
    width: 100%;
    height: 3.2rem;
    box-sizing: border-box;
    margin-bottom: 1rem;
  }

  .lock-note {
    display: inline-block;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.7;
  }

  .soft {
    opacity: 0.75;
  }
</style>
