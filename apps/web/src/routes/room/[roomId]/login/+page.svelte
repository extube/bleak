<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { ApiError, createUser } from "$lib/api";
  import { saveRoomUser } from "$lib/roomUser";

  const roomId = $derived(page.params.roomId ?? "");

  let userId = $state("");
  let name = $state("");
  let publicBio = $state("");
  let privateBio = $state("");
  let submitError = $state("");
  let busy = $state(false);

  function submit(event: SubmitEvent) {
    event.preventDefault();
    submitError = "";
    const uid = userId.trim();
    if (!uid) {
      submitError = "★ A user id is required.";
      return;
    }
    busy = true;
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
              ? "★ This user id is already taken in the room."
              : err.status === 410
                ? "★ Room was deleted or the invite expired."
                : `★ ${err.message}`
            : "★ Unexpected error.";
      })
      .finally(() => (busy = false));
  }
</script>

<main>
  <h1 class="no-star">Room {roomId} — login</h1>

  <form onsubmit={submit}>
    <p>
      <label>
        User id<br />
        <input bind:value={userId} maxlength="32" placeholder="e.g. AB3F2K" required />
      </label>
    </p>
    <p>
      <label>
        Display name<br />
        <input bind:value={name} maxlength="64" placeholder="optional" />
      </label>
    </p>
    <p>
      <label>
        Public bio<br />
        <input bind:value={publicBio} maxlength="128" placeholder="optional, visible to others" />
      </label>
    </p>
    <p>
      <label>
        Private bio<br />
        <input bind:value={privateBio} maxlength="128" placeholder="optional, only yours" />
      </label>
    </p>

    <p class="error">{submitError}</p>

    <button type="submit" disabled={busy || !roomId}>Create user &amp; enter space</button>
    <button type="button" class="secondary" onclick={() => history.back()}>← Back</button>
  </form>
</main>
