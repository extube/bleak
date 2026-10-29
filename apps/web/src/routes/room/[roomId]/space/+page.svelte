<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import QRCode from "qrcode";
  import type { HandshakeStatus } from "@ble-id/shared-types";
  import { getRoomUser } from "$lib/roomUser";
  import { listHandshakes } from "$lib/api";
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
    return undefined;
  });
</script>

<svelte:head>
  <title>space — room {roomId}</title>
</svelte:head>

<div class="frame">
  <header>
    <button type="button" class="back" aria-label="back" onclick={() => history.back()}>←</button>
    <span class="room-id">room {roomId}</span>
    <span class="header-spacer"></span>
    <a
      class="icon-btn"
      href="/start"
      aria-label="scan"
      title="scan a qr code"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
        <path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
        <path d="M4 12h16" />
      </svg>
    </a>
    <button type="button" class="icon-btn" aria-label="my qr" title="show my handshake qr" onclick={openQr}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <path d="M14 14h3v3h-3zM18.5 18.5h2.5v2.5h-2.5zM14 19.5v1.5" stroke-linecap="round" />
      </svg>
    </button>
  </header>

  <main>
    {#if user && roomId}
      <fieldset class="panel">
        <legend>listening as</legend>
        <p class="row">
          <code>{user.userId}</code>
          {#if user.name}<span class="soft">({user.name})</span>{/if}
        </p>
      </fieldset>

      <fieldset class="panel contacts" class:empty={contacts.length === 0}>
        <legend>handshakes</legend>
        {#if loading}
          <p class="soft">loading…</p>
        {:else if loadError}
          <p class="soft error">{loadError}</p>
        {:else if contacts.length === 0}
          <p class="no-contacts">no contacts yet — handshake with someone by qr code</p>
        {:else}
          <ul>
            {#each contacts as contact (contact.id)}
              <li>
                <a href={`/room/${roomId}/user/${contact.peer.userId}`}>
                  <span class="peer-name">{contact.peer.name || contact.peer.userId}</span>
                  <span class="status" class:is-friend={contact.friends}>{statusLabel(contact)}</span>
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      </fieldset>

      <dialog class="qr-dialog" bind:this={qrDialog}>
        <div class="qr-head">
          <span>handshake qr</span>
          <button type="button" class="close" onclick={closeQr}>×</button>
        </div>
        {#if qrDataUrl}
          <img src={qrDataUrl} alt="Handshake QR code" width="260" height="260" />
        {/if}
        <p class="soft">ask them to scan — one tap and you two are contacts</p>
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

  .room-id {
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .header-spacer {
    flex: 1;
  }

  .icon-btn {
    width: 3.2rem;
    height: 3.2rem;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    color: var(--ink);
    background: transparent;
    border: 3px solid var(--ink);
    border-radius: 0.7rem;
    cursor: pointer;
    text-decoration: none;
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

  .contacts ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .contacts li + li {
    border-top: 2px solid rgba(13, 13, 13, 0.08);
  }

  .contacts a {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.65rem 0.1rem;
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

  .contacts.empty {
    display: flex;
    justify-content: center;
  }

  .no-contacts {
    margin: 1.75rem 0.25rem;
    text-align: center;
    font-weight: 700;
    opacity: 0.85;
  }

  .qr-dialog {
    border: 3px solid var(--ink);
    border-radius: 0.9rem;
    background: #fffdf2;
    padding: 1rem;
    width: min(320px, 92vw);
    box-sizing: border-box;
  }

  .qr-dialog::backdrop {
    background: rgba(13, 13, 13, 0.55);
  }

  .qr-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.6rem;
  }

  .qr-head span {
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.85rem;
  }

  .close {
    width: 2rem;
    height: 2rem;
    padding: 0;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .qr-dialog img {
    display: block;
    margin: 0 auto;
    border-radius: 0.5rem;
  }

  .soft {
    opacity: 0.75;
  }

  .error {
    font-weight: 700;
    opacity: 1;
  }
</style>
