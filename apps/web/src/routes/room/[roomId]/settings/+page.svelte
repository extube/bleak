<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import type { UserProfile } from "@ble-id/shared-types";
  import { USER_FIELD_LIMITS } from "@ble-id/shared-types";
  import { getRoomUser, saveRoomUser } from "$lib/roomUser";
  import { getUserProfile, updateUser } from "$lib/api";

  const roomId = $derived(page.params.roomId ?? "");
  const user = $derived(getRoomUser(roomId));

  let publicBio = $state("");
  let privateBio = $state("");
  let loading = $state(true);
  let saving = $state(false);
  let saveError = $state("");

  let formEl: HTMLFormElement | undefined = $state();
  let publicEl: HTMLTextAreaElement | undefined = $state();
  let privateEl: HTMLTextAreaElement | undefined = $state();

  /** Enter moves to the next field (Shift+Enter makes a newline); last field saves. */
  function onFieldKeydown(event: KeyboardEvent, next: "private" | "submit") {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (next === "private") privateEl?.focus();
    else formEl?.requestSubmit();
  }

  onMount(async () => {
    if (!roomId || !user) {
      goto(`/room/${roomId}/login`, { replaceState: true });
      return;
    }
    try {
      const profile = await getUserProfile(roomId, user.userId);
      publicBio = profile.publicBio ?? "";
      privateBio = profile.privateBio ?? "";
    } catch {
      saveError = "could not load your profile";
    }
    loading = false;
  });

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!roomId || !user || saving) return;
    saving = true;
    saveError = "";
    try {
      const profile: UserProfile = await updateUser(roomId, user.userId, {
        publicBio,
        privateBio,
      });
      saveRoomUser(roomId, profile);
      goto(`/room/${roomId}/space`);
    } catch (err) {
      saveError = err instanceof Error ? err.message : String(err);
      saving = false;
    }
  }
</script>

<svelte:head>
  <title>profile settings — room {roomId}</title>
</svelte:head>

<div class="frame">
  <header>
    <button type="button" class="back" aria-label="back" onclick={() => history.back()}>←</button>
    <span class="title">profile settings</span>
  </header>

  <main>
    {#if loading}
      <p class="soft">loading…</p>
    {:else}
      <form onsubmit={save} bind:this={formEl}>
        <fieldset class="panel">
          <legend>public bio</legend>
          <textarea
            bind:this={publicEl}
            bind:value={publicBio}
            rows="3"
            maxlength={USER_FIELD_LIMITS.publicBio}
            placeholder="visible to everyone in the room"
            onkeydown={(e) => onFieldKeydown(e, "private")}
          ></textarea>
        </fieldset>

        <fieldset class="panel private">
          <legend>
            private bio
            <svg class="lock" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="5" y="10" width="14" height="10" rx="1.5" />
              <path
                d="M8 10V7a4 4 0 0 1 8 0v3"
                fill="none"
                stroke-width="2.2"
              />
            </svg>
          </legend>
          <textarea
            bind:this={privateEl}
            bind:value={privateBio}
            rows="3"
            maxlength={USER_FIELD_LIMITS.privateBio}
            placeholder="only your mutual friends will see this"
            onkeydown={(e) => onFieldKeydown(e, "submit")}
          ></textarea>
        </fieldset>

        {#if saveError}
          <p class="error">{saveError}</p>
        {/if}

        <button type="submit" class="save" disabled={saving}>
          {saving ? "saving…" : "save"}
        </button>
      </form>
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
    gap: 0.6rem;
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

  .title {
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
  }

  fieldset.panel {
    border: 2px solid var(--ink);
    border-radius: 0.7rem;
    padding: 0.6rem 0.75rem 0.4rem;
    margin: 0 0 1rem;
  }

  fieldset.panel legend {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.85rem;
    font-weight: 700;
    padding: 0 0.4rem;
  }

  textarea {
    width: 100%;
    box-sizing: border-box;
    border: none;
    background: transparent;
    color: var(--ink);
    font: inherit;
    line-height: 1.55;
    padding: 0.3rem 0.2rem;
    resize: none;
  }

  textarea:focus {
    outline: none;
  }

  fieldset.panel.private {
    background:
      linear-gradient(180deg, var(--yellow) 0%, var(--yellow-hot) 100%)
      padding-box;
    background-repeat: no-repeat;
  }

  fieldset.panel.private legend {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .lock {
    width: 0.9em;
    height: 0.9em;
  }

  .lock rect {
    fill: currentColor;
    stroke: none;
  }

  .lock path {
    stroke: currentColor;
  }

  fieldset.panel.private textarea::placeholder {
    color: var(--ink);
    opacity: 0.55;
  }

  .save {
    width: 100%;
    height: 3.2rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .save:disabled {
    opacity: 0.6;
  }

  .soft {
    opacity: 0.75;
  }

  .error {
    margin: 0 0 0.8rem;
    font-weight: 700;
  }
</style>
