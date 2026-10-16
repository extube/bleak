import type { Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type {
  ClaimRequest,
  ClaimResult,
  ClientMessage,
  IdClaim,
  RelayEvent,
} from "@ble-id/shared-types";
import { CLAIM_TTL_MS } from "@ble-id/shared-types";
import type { ClaimStore } from "./store.js";

interface ClientCtx {
  socket: WebSocket;
  /** exchange codes this client watches, or null = watch all */
  watch: Set<string> | "all";
}

const clients = new Set<ClientCtx>();

export function attachWebSocketHub(server: Server, store: ClaimStore): WebSocketServer {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (socket) => {
    const ctx: ClientCtx = { socket, watch: "all" };
    clients.add(ctx);

    const send = (event: RelayEvent) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
    };

    send({ type: "connected", clientId: crypto.randomUUID() });

    socket.on("message", (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        return send({ type: "noop" });
      }
      handleMessage(msg, ctx, store, send);
    });

    socket.on("close", () => clients.delete(ctx));
  });

  return wss;
}

/** Broadcast claim-opened to watchers of that code (or everyone). */
export function broadcast(event: RelayEvent, codes: Set<string> | null): void {
  for (const ctx of clients) {
    const watched = ctx.watch;
    const interested =
      watched === "all" ||
      (codes !== null && [...codes].some((c) => watched.has(c)));
    if (!interested) continue;
    if (ctx.socket.readyState === ctx.socket.OPEN) {
      ctx.socket.send(JSON.stringify(event));
    }
  }
}

function handleMessage(
  msg: ClientMessage,
  ctx: ClientCtx,
  store: ClaimStore,
  send: (event: RelayEvent) => void,
): void {
  switch (msg.type) {
    case "ping":
      send({ type: "noop" });
      break;
    case "watch": {
      ctx.watch = msg.exchangeCode ? new Set([msg.exchangeCode]) : "all";
      break;
    }
    case "unwatch": {
      ctx.watch = new Set();
      break;
    }
    case "claim": {
      handleClaim(msg.body, store, send);
      break;
    }
  }
}

function handleClaim(
  req: ClaimRequest,
  store: ClaimStore,
  send: (event: RelayEvent) => void,
): void {
  const now = Date.now();
  const activeCodes = store.listExchangeCodes();

  if (!activeCodes.includes(req.exchangeCode)) {
    sendClaimResult(send, { ok: false, reason: "unknown-exchange-code" });
    return;
  }

  const outcome = store.claimExchange({
    userId: req.userId,
    exchangeCode: req.exchangeCode,
    token: req.token,
    now,
  });

  if (outcome === "taken") {
    sendClaimResult(send, { ok: false, reason: "code-already-claimed" });
    return;
  }

  const claim: IdClaim = {
    userId: req.userId,
    token: req.token,
    exchangeCode: req.exchangeCode,
    createdAt: now,
    expiresAt: now + CLAIM_TTL_MS,
  };

  broadcast({ type: "claim-opened", claim }, new Set([req.exchangeCode]));
  sendClaimResult(send, { ok: true, claim });
}

function sendClaimResult(send: (event: RelayEvent) => void, result: ClaimResult): void {
  send({ type: "claim-result", result });
}
