<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { ApiError, createUser } from "$lib/api";
  import { saveRoomUser } from "$lib/roomUser";

  const roomId = $derived(page.params.roomId ?? "");

  const BIO_MAX = 128;

  let name = $state("");
  let publicBio = $state("");
  let privateBio = $state("");
  let submitError = $state("");
  let busy = $state(false);

  function generateUserId(): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ123456789";
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    let out = "";
    for (const b of bytes) out += alphabet[b % alphabet.length];
    return out;
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    submitError = "";
    busy = true;
    const uid = generateUserId();
    createUser(roomId, {
      userId: uid,
      name: name.trim(),
      publicBio: publicBio.trim(),
      privateBio: privateBio.trim(),
    })
      .then((profile) => {
        saveRoomUser(roomId, profile);
        return goto(`/room/${roomId}/space`, { replaceState: true });
      })
      .catch((err) => {
        submitError =
          err instanceof ApiError
            ? err.status === 409
              ? "user id collision, try again"
              : err.status === 410
                ? "room was deleted or the invite expired"
                : err.message
            : "unexpected error";
      })
      .finally(() => (busy = false));
  }
</script>

<svelte:head>
  <title>login — room {roomId}</title>
</svelte:head>

<div class="frame">
  <header>
    <button
      type="button"
      class="back"
      aria-label="back"
      onclick={() => history.back()}
    >
      ←
    </button>
    <span class="room-id">room {roomId}</span>
    <span class="header-spacer"></span>
  </header>

  <main>
    <form id="login-form" onsubmit={submit}>
      <fieldset class="bio name">
        <legend>display name</legend>
        <textarea
          bind:value={name}
          maxlength="64"
          rows="1"
          placeholder="your display name"
        ></textarea>
      </fieldset>

      <fieldset class="bio public">
        <legend>public bio</legend>
        <textarea
          bind:value={publicBio}
          maxlength={BIO_MAX}
          rows="3"
          placeholder="what others may know about you, e.g. radio hobbyist, likes cats"
        ></textarea>
        <span class="counter">{publicBio.length}/{BIO_MAX}</span>
      </fieldset>

      <fieldset class="bio private">
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
          bind:value={privateBio}
          maxlength={BIO_MAX}
          rows="5"
          placeholder="info for selected contacts and friends you choose"
        ></textarea>
        <span class="counter">{privateBio.length}/{BIO_MAX}</span>
      </fieldset>

      <p class="error">{submitError}</p>
    </form>
  </main>

  <footer>
    <button type="submit" form="login-form" disabled={busy || !roomId} class="login-btn">
      login
    </button>
  </footer>
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
    width: 2.4rem;
    height: 2.4rem;
    line-height: 1;
    padding: 0;
  }

  .room-id {
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .header-spacer {
    flex: 1;
  }

  main {
    flex: 1;
    width: 100%;
    max-width: 480px;
    margin: 0 auto;
    padding: 1.5rem 1.25rem 2rem;
    box-sizing: border-box;
  }

  fieldset.bio {
    border: 2px solid var(--ink);
    border-radius: 0.7rem;
    padding: 0.6rem 0.75rem 0.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  fieldset.bio legend {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.85rem;
    font-weight: 700;
    padding: 0 0.4rem;
    background: var(--yellow);
  }

  fieldset.bio textarea {
    font: inherit;
    border: none;
    background: transparent;
    color: inherit;
    resize: vertical;
    width: 100%;
    box-sizing: border-box;
    outline: none;
    min-height: 3.5rem;
    font-size: 1rem;
  }

  fieldset.name {
    margin-top: 0.2rem;
  }

  fieldset.name textarea {
    font-size: 1.15rem;
    min-height: 2.2rem;
    resize: none;
    overflow: hidden;
  }

  fieldset.bio textarea::placeholder {
    color: var(--olive);
    opacity: 0.8;
  }

  fieldset.bio .counter {
    align-self: flex-end;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    opacity: 0.75;
  }

  fieldset.private {
    background: linear-gradient(
        180deg,
        var(--yellow) 0%,
        var(--yellow-hot) 100%
      )
      padding-box;
    background-repeat: no-repeat;
    color: var(--ink);
  }

  fieldset.private legend {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    background: transparent;
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

  fieldset.private textarea {
    min-height: 8rem;
  }

  fieldset.private textarea::placeholder {
    color: var(--ink);
    opacity: 0.55;
  }

  footer {
    position: sticky;
    bottom: 0;
    background: var(--yellow);
    border-top: 2px solid var(--ink);
    padding: 0.8rem 1.25rem;
  }

  .login-btn {
    width: 100%;
  }

  .error {
    font-weight: 700;
    min-height: 1.2em;
    margin: 0.5rem 0;
  }

  .error::before {
    content: none;
  }
</style>
