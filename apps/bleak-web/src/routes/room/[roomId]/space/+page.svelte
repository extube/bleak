<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import QRCode from "qrcode";
  import type { HandshakeStatus, UserProfile } from "@ble-id/shared-types";
  import { getRoomUser } from "$lib/roomUser";
  import { userSymbolList } from "$lib/symbols";
  import { listHandshakes, getUserProfile } from "$lib/api";
  import { ApiError } from "$lib/api";

  const roomId = $derived(page.params.roomId ?? "");
  const user = $derived(getRoomUser(roomId));

  type Contact = {
    id: string;
    peer: { userId: string; name: string };
    mine: HandshakeStatus;
    theirs: HandshakeStatus;
    friends: boolean;
  };

  let contacts = $state<Contact[]>([]);
  let loading = $state(true);
  let loadError = $state("");
  let ownProfile = $state<UserProfile | null>(null);
  let qrDataUrl = $state("");
  let qrDialog: HTMLDialogElement | undefined = $state();

  function closeQr() {

    qrDialog?.close();
  }

  function statusLabel(contact: Contact): string {
    if (contact.friends) return "friend";
    if (contact.mine === "friend") return "friend (pending)";
    return "contacts";
  }

  async function openQr() {
    if (!user || !roomId) return;
    try {
      qrDataUrl = await QRCode.toDataURL(
        `${location.origin}/room/${roomId}/handshake/${user.userId}`,
        {
          width: 260,
          margin: 1,
          color: { dark: "#0d0d0d", light: "#fffdf2" },
        },
      );

      qrDialog?.showModal();
    } catch {
      void 0;
    }
  }

  onMount(() => {
    if (!roomId || !user) {
      goto(`/room/${roomId}/login`, { replaceState: true });
      return undefined;
    }
    loading = true;
    listHandshakes(roomId, user.userId)
      .then((list) => {
        contacts = list as Contact[];
        loadError = "";
      })
      .catch((err) => {
        loadError = err instanceof ApiError ? `${err.status}: ${err.message}` : String(err);
      })
      .finally(() => {
        loading = false;
      });
    getUserProfile(roomId, user.userId)
      .then((profile) => {
        ownProfile = profile;
      })
      .catch(() => {
        void 0;
      });
    return undefined;
  });
</script>

<svelte:head>
  <title>space — room {roomId}</title>
</svelte:head>

<div class="frame">
  <header>
    <div class="head-left">
      <span class="room-id">room {roomId}</span>
      <button type="button" class="dots" aria-label="settings" title="settings">⋮</button>
    </div>
    <div class="head-right">
      <a class="icon-btn" href="/start" aria-label="scan" title="scan a qr code">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="2.5" y="7" width="19" height="13" rx="2.5" />
          <path d="M8.5 7l1.6-2.4h3.8L15.5 7" />
          <circle cx="12" cy="13.5" r="3.2" />
        </svg>
      </a>
      <button type="button" class="icon-btn" aria-label="my qr" title="show my handshake qr" onclick={openQr}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  </header>

  <main>
    {#if user && roomId}
      <fieldset class="panel identity">
        <legend class="symbol-legend" aria-label="your identity symbols">
          {userSymbolList(user.userId).join("")}
        </legend>
        <button
          type="button"
          class="identity-hit"
          aria-label="edit your profile"
          title="edit your profile"
          onclick={() => goto(`/room/${roomId}/settings`)}
        ></button>
        <p class="id-name">{user.name || user.userId}</p>
        <p class="id-bio" class:muted={!ownProfile?.publicBio}>
          {ownProfile?.publicBio || "no public bio yet"}
        </p>
      </fieldset>

      <h2 class="contacts-title">Contacts</h2>

      {#if loading}
        <p class="soft">loading…</p>
      {:else if loadError}
        <p class="soft error">{loadError}</p>
      {:else if contacts.length === 0}
        <div class="empty-note">
          <p class="empty-title">no contacts yet</p>
          <p class="empty-hint">
            tap <b>+</b> in the header to show your qr, or <b>scan</b> someone else's — one tap on
            the link and you two are contacts
          </p>
        </div>
      {:else}
        <div class="cards">
          {#each contacts as contact (contact.id)}
            <a class="box card" href={`/room/${roomId}/user/${contact.peer.userId}`}>
              <span class="peer-name">{contact.peer.name || contact.peer.userId}</span>
              <span class="status" class:is-friend={contact.friends}>{statusLabel(contact)}</span>
            </a>
          {/each}
        </div>
      {/if}

      <dialog class="qr-dialog" bind:this={qrDialog}>
        <div class="qr-head">
          <span>handshake qr</span>
          <button type="button" class="close" onclick={closeQr} aria-label="close">×</button>
        </div>
        <div class="qr-body">
          {#if qrDataUrl}
            <div class="qr-tile">
              <img src={qrDataUrl} alt="Handshake QR code" width="248" height="248" />
            </div>
          {/if}
          <p class="qr-hint">ask them to scan — one tap and you two are contacts</p>
        </div>
      </dialog>
    {:else}
      <p class="soft">redirecting to room login…</p>
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
    justify-content: space-between;
    gap: 0.6rem;
    padding: 0.8rem 1.25rem;
    border-bottom: 2px solid var(--ink);
  }

  .head-left {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }

  .head-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .dots {
    flex: none;
    width: 2.6rem;
    height: 2.6rem;
    padding: 0;
    line-height: 1;
    font-size: 1.4rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--ink);
    background: transparent;
    border: none;
    border-radius: 50%;
    cursor: pointer;
  }

  .room-id {
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .icon-btn {
    width: 3rem;
    height: 3rem;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    color: var(--yellow);
    background: var(--ink);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    text-decoration: none;
  }

  .icon-btn:active {
    transform: scale(0.92);
  }

  .dots {
    flex: none;
    width: 2.6rem;
    height: 2.6rem;
    padding: 0;
    line-height: 1;
    font-size: 1.4rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--ink);
    background: transparent;
    border: none;
    border-radius: 50%;
    cursor: pointer;
  }

  main {
    flex: 1;
    width: 100%;
    max-width: 480px;
    margin: 0 auto;
    padding: 1.5rem 1.25rem 2rem;
    box-sizing: border-box;
  }

  .box {
    border: 2px solid var(--ink);
    border-radius: 0.7rem;
    padding: 0.75rem 1rem;
  }

  .identity {
    position: relative;
    border: 2px solid var(--ink);
    border-radius: 0.7rem;
    padding: 0.35rem 1rem 0.55rem;
    margin: 0 0 0.4rem;
  }

  .identity .symbol-legend {
    font-size: 1.25rem;
    line-height: 1.2;
    letter-spacing: 0.14em;
    user-select: none;
  }

  .identity .id-name {
    margin: 0;
    font-weight: 800;
    font-size: 1.25rem;
    letter-spacing: 0.02em;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .identity .id-bio {
    margin: 0.25rem 0 0;
    font-size: 0.92rem;
    line-height: 1.4;
  }

  .identity .id-bio.muted {
    opacity: 0.55;
    font-style: italic;
  }

  .identity-hit {
    position: absolute;
    inset: 0;
    z-index: 1;
    border: none;
    background: transparent;
    border-radius: inherit;
    padding: 0;
  }

  .identity-hit:hover,
  .identity-hit:active {
    background: transparent;
    cursor: pointer;
  }

  .contacts-title {
    margin: 1.4rem 0 0.7rem;
    font-size: 1.45rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.09em;
  }

  .cards {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    color: var(--ink);
    text-decoration: none;
  }

  .peer-name {
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status {
    flex: none;
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0.15rem 0.5rem;
    border: 2px solid var(--ink);
    border-radius: 999px;
    opacity: 0.8;
  }

  .status.is-friend {
    background: var(--ink);
    color: var(--yellow);
    opacity: 1;
  }

  .empty-note {
    margin-top: 22vh;
    text-align: center;
  }

  .empty-title {
    margin: 0 0 0.6rem;
    font-weight: 800;
    font-size: 1.2rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .empty-hint {
    margin: 0 auto;
    max-width: 17rem;
    font-size: 0.95rem;
    line-height: 1.55;
    opacity: 0.85;
  }

  .qr-dialog {
    border: 3px solid var(--ink);
    border-radius: 1rem;
    background: var(--yellow);
    padding: 0;
    width: min(340px, 92vw);
    box-sizing: border-box;
    box-shadow: 10px 10px 0 rgba(13, 13, 13, 0.35);
    overflow: hidden;
    animation: qr-pop 0.22s cubic-bezier(0.2, 1.2, 0.4, 1);
  }

  @keyframes qr-pop {
    from {
      transform: scale(0.85);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }

  .qr-dialog::backdrop {
    background: rgba(13, 13, 13, 0.6);
    backdrop-filter: blur(2px);
  }

  .qr-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.65rem 0.8rem 0.65rem 1rem;
    background: var(--ink);
    color: var(--yellow);
  }

  .qr-head span {
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: 0.85rem;
  }

  .close {
    width: 2.1rem;
    height: 2.1rem;
    padding: 0;
    line-height: 1;
    font-size: 1.1rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: var(--yellow);
    border: 2px solid var(--yellow);
    border-radius: 0.5rem;
    cursor: pointer;
  }

  .close:hover {
    background: var(--yellow);
    color: var(--ink);
  }

  .qr-body {
    padding: 1.25rem 1.25rem 1.1rem;
    background: #fffdf2;
  }

  .qr-tile {
    display: grid;
    place-items: center;
    width: fit-content;
    margin: 0 auto;
    padding: 0.7rem;
    border: 3px solid var(--ink);
    border-radius: 0.7rem;
    background: #fffdf2;
    box-shadow: 5px 5px 0 var(--olive);
  }

  .qr-tile img {
    display: block;
    border-radius: 0.25rem;
  }

  .qr-hint {
    margin: 1rem 0 0;
    text-align: center;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--olive-black);
    opacity: 0.85;
  }

  .soft {
    opacity: 0.75;
  }

  .error {
    font-weight: 700;
    opacity: 1;
  }
</style>
