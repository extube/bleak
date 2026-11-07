import { writable } from "svelte/store";
import type {
  ClaimResult,
  IdClaim,
  RelayEvent,
  UserId,
} from "@ble-id/shared-types";

export interface RelayState {
  status: "idle" | "connecting" | "open" | "closed" | "error";
  clientId?: string;
  error?: string;
}

export interface IdRecord {
  userId: UserId;
  exchangeCode: string;
  claimedAt: number;
}

/**
 * Thin client for the relay WS protocol (packages/shared-types based).
 * Sidebar note: the URL is intentionally composed like
 *   ws(s)://host/ws  — env-friendly (behind the same reverse proxy).
 */
export function createRelay(
  baseWsUrl: string,
  onEvent?: (event: RelayEvent) => void,
) {
  const state = writable<RelayState>({ status: "idle" });
  const claims = writable<IdRecord[]>([]);
  const claimResults = writable<ClaimResult[]>([]);

  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closedByUs = false;

  function connect() {
    if (socket && socket.readyState !== WebSocket.CLOSED) return;
    state.set({ status: "connecting" });

    socket = new WebSocket(baseWsUrl);

    socket.onopen = () => state.set({ status: "open" });
    socket.onclose = () => {
      state.update((s) => (s.status === "open" ? { status: "closed" } : s));
      if (!closedByUs) scheduleReconnect();
    };
    socket.onerror = () =>
      state.set({ status: "error", error: "socket error" });

    socket.onmessage = (event) => {
      let msg: RelayEvent;
      try {
        msg = JSON.parse(event.data) as RelayEvent;
      } catch {
        return;
      }
      onEvent?.(msg);
      switch (msg.type) {
        case "connected":
          state.set({ status: "open", clientId: msg.clientId });
          break;
        case "claim-opened":
          claims.update((list) => [
            {
              userId: msg.claim.userId,
              exchangeCode: msg.claim.exchangeCode,
              claimedAt: msg.claim.createdAt,
            },
            ...list.filter(
              (c) =>
                !(
                  c.userId === msg.claim.userId &&
                  c.exchangeCode === msg.claim.exchangeCode
                ),
            ),
          ]);
          break;
        case "claim-closed":
          claims.update((list) =>
            list.filter(
              (c) =>
                !(
                  c.exchangeCode === msg.exchangeCode && c.userId === msg.userId
                ),
            ),
          );
          break;
        case "claim-result":
          claimResults.update((list) => [msg.result, ...list].slice(0, 20));
          break;
        case "noop":
          break;
      }
    };
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 2500);
  }

  function disconnect() {
    closedByUs = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    socket?.close();
    socket = null;
    state.set({ status: "idle" });
  }

  function submitClaim(
    userId: UserId,
    token: string,
    exchangeCode: string,
  ): void {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      claimResults.update((l) => [
        { ok: false, reason: "unknown-exchange-code" },
        ...l,
      ]);
      return;
    }
    socket.send(
      JSON.stringify({ type: "claim", body: { userId, token, exchangeCode } }),
    );
  }

  return {
    state,
    claims,
    claimResults,
    connect,
    disconnect,
    submitClaim,
  };
}

export type Relay = ReturnType<typeof createRelay>;
