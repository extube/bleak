import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import fastifyStatic from "@fastify/static";
import type { RoomProfile, UserProfile } from "@ble-id/shared-types";
import { attachWebSocketHub } from "./hub.js";
import { ClaimStore, type RoomRow, type UserRow } from "./store.js";
import { ROOM_FIELD_LIMITS, USER_FIELD_LIMITS } from "@ble-id/shared-types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Config {
  port: number;
  webDistDir?: string;
}

function toProfile(row: UserRow): UserProfile {
  return {
    userId: row.user_id,
    name: row.name,
    publicBio: row.public_bio,
    privateBio: row.private_bio,
    meta: row.meta,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRoom(row: RoomRow): RoomProfile {
  return {
    roomId: row.room_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface ReplyError {
  status: number;
  body: { error: string };
}

/** Rejects non-string / over-limit text fields for user payloads. */
function validateUserText(
  patch: Record<string, unknown>,
  reply: FastifyReply,
): { name?: string; publicBio?: string; privateBio?: string; meta?: string } | null {
  const out: { name?: string; publicBio?: string; privateBio?: string; meta?: string } = {};
  for (const [key, limit] of Object.entries(USER_FIELD_LIMITS)) {
    const value = patch[key];
    if (value === undefined) continue;
    if (typeof value !== "string") {
      void reply.status(400).send({ error: `${key} must be a string` });
      return null;
    }
    if (value.length > limit) {
      void reply.status(400).send({ error: `${key} too long (max ${limit})` });
      return null;
    }
    out[key as keyof typeof USER_FIELD_LIMITS] = value;
  }
  return out;
}

function buildServer(cfg: Config, store: ClaimStore): FastifyInstance {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ status: "ok" }));

  // -- Rooms ---------------------------------------------------------------

  app.post<{ Body: { roomId?: string; name?: string } }>(
    "/api/room",
    async (request, reply) => {
      const body = request.body ?? ({} as never);
      if (body.roomId !== undefined) {
        if (typeof body.roomId !== "string" || body.roomId.length === 0 || body.roomId.length > ROOM_FIELD_LIMITS.roomId) {
          return reply.status(400).send({ error: `roomId must be 1-${ROOM_FIELD_LIMITS.roomId} chars` });
        }
      }
      if (body.name !== undefined) {
        if (typeof body.name !== "string") {
          return reply.status(400).send({ error: "name must be a string" });
        }
        if (body.name.length > ROOM_FIELD_LIMITS.name) {
          return reply.status(400).send({ error: `name too long (max ${ROOM_FIELD_LIMITS.name})` });
        }
      }
      const result = store.createRoom(body);
      if (result === "exists") {
        return reply.status(409).send({ error: "roomId already registered" });
      }
      return reply.status(201).send(toRoom(store.roomById(result.roomId)!));
    },
  );

  app.patch<{ Params: { roomId: string }; Body: { name?: string } }>(
    "/api/room/:roomId",
    async (request, reply) => {
      const name = (request.body ?? {}).name;
      if (name !== undefined) {
        if (typeof name !== "string") return reply.status(400).send({ error: "name must be a string" });
        if (name.length > ROOM_FIELD_LIMITS.name) {
          return reply.status(400).send({ error: `name too long (max ${ROOM_FIELD_LIMITS.name})` });
        }
      }
      const result = store.updateRoom(request.params.roomId, { name });
      if (result === "not-found") return reply.status(404).send({ error: "unknown roomId" });
      if (result === "already-deleted") return reply.status(410).send({ error: "room is soft-deleted" });
      return reply.send(toRoom(store.roomById(request.params.roomId)!));
    },
  );

  app.get<{ Params: { roomId: string } }>("/api/room/:roomId", async (request, reply) => {
    const row = store.roomById(request.params.roomId);
    if (!row) return reply.status(404).send({ error: "unknown roomId" });
    return reply.send(toRoom(row));
  });

  // Soft delete — tombstones the room; members survive but become unreachable.
  app.delete<{ Params: { roomId: string } }>("/api/room/:roomId", async (request, reply) => {
    const result = store.softDeleteRoom(request.params.roomId);
    if (result === "not-found") return reply.status(404).send({ error: "unknown roomId" });
    if (result === "already-deleted") return reply.status(410).send({ error: "already soft-deleted" });
    return reply.status(204).send();
  });

  // -- Members of a room -----------------------------------------------------

  /** 404/410 unless the room exists and is active. */
  const requireRoom = (roomId: string): ReplyError | null => {
    const room = store.roomById(roomId, true);
    if (!room) return { status: 404, body: { error: "unknown roomId" } };
    if (room.deleted_at !== null) return { status: 410, body: { error: "room is soft-deleted" } };
    return null;
  };

  app.post<{ Params: { roomId: string }; Body: { userId?: string; name?: string; publicBio?: string; privateBio?: string; meta?: string } }>(
    "/api/room/:roomId/users",
    async (request, reply) => {
      const roomErr = requireRoom(request.params.roomId);
      if (roomErr) return reply.status(roomErr.status).send(roomErr.body);

      const body = request.body ?? ({} as never);
      if (typeof body.userId !== "string" || body.userId.length === 0 || body.userId.length > 32) {
        return reply.status(400).send({ error: "userId must be 1-32 chars" });
      }
      const fields = validateUserText(body, reply);
      if (fields === null) return reply;

      const result = store.createUser({ roomId: request.params.roomId, userId: body.userId, ...fields });
      if (result === "user-exists") {
        return reply.status(409).send({ error: "userId already registered" });
      }
      return reply.status(201).send(toProfile(store.userById(body.userId)!));
    },
  );

  app.get<{ Params: { roomId: string; userId: string } }>(
    "/api/room/:roomId/users/:userId",
    async (request, reply) => {
      const roomErr = requireRoom(request.params.roomId);
      if (roomErr) return reply.status(roomErr.status).send(roomErr.body);

      const row = store.userById(request.params.userId);
      if (!row || row.room_id !== request.params.roomId) {
        return reply.status(404).send({ error: "unknown userId in this room" });
      }
      return reply.send(toProfile(row));
    },
  );

  app.patch<{ Params: { roomId: string; userId: string }; Body: { name?: string; publicBio?: string; privateBio?: string; meta?: string } }>(
    "/api/room/:roomId/users/:userId",
    async (request, reply) => {
      const roomErr = requireRoom(request.params.roomId);
      if (roomErr) return reply.status(roomErr.status).send(roomErr.body);

      const fields = validateUserText(request.body ?? {}, reply);
      if (fields === null) return reply;

      const result = store.updateUser(request.params.roomId, request.params.userId, fields);
      if (result === "user-not-found") return reply.status(404).send({ error: "unknown userId in this room" });
      if (result === "already-deleted") return reply.status(410).send({ error: "user is soft-deleted" });
      return reply.send(toProfile(store.userById(request.params.userId)!));
    },
  );

  // Soft delete — tombstones the user.
  app.delete<{ Params: { roomId: string; userId: string } }>(
    "/api/room/:roomId/users/:userId",
    async (request, reply) => {
      const roomErr = requireRoom(request.params.roomId);
      if (roomErr) return reply.status(roomErr.status).send(roomErr.body);

      const { roomId, userId } = request.params;
      const result = store.softDeleteUser(roomId, userId);
      if (result === "user-not-found") return reply.status(404).send({ error: "unknown userId in this room" });
      if (result === "already-deleted") return reply.status(410).send({ error: "already soft-deleted" });
      return reply.status(204).send();
    },
  );

  // Force delete — separate method/route, wipes the row outright.
  app.delete<{ Params: { roomId: string; userId: string } }>(
    "/api/room/:roomId/users/:userId/force",
    async (request, reply) => {
      const roomErr = requireRoom(request.params.roomId);
      if (roomErr) return reply.status(roomErr.status).send(roomErr.body);

      const result = store.forceDeleteUser(request.params.roomId, request.params.userId);
      if (result === "user-not-found") return reply.status(404).send({ error: "unknown userId in this room" });
      return reply.status(204).send();
    },
  );

  // -- Migration -------------------------------------------------------------

  /**
   * Copy a user into another room under a fresh identity. Every profile field
   * survives; only the id changes. Path chosen over the migrate/:roomId/:userId
   * tail — the target lives in the body where validation belongs.
   */
  app.post<{
    Params: { roomId: string; userId: string };
    Body: { roomId: string; userId: string };
  }>("/api/room/:roomId/users/:userId/migrate", async (request, reply) => {
    const roomErr = requireRoom(request.params.roomId);
    if (roomErr) return reply.status(roomErr.status).send(roomErr.body);

    const body = request.body ?? ({} as never);
    if (typeof body.roomId !== "string" || body.roomId.length === 0) {
      return reply.status(400).send({ error: "roomId (target) required" });
    }
    if (typeof body.userId !== "string" || body.userId.length === 0 || body.userId.length > 32) {
      return reply.status(400).send({ error: "userId (target) must be 1-32 chars" });
    }
    if (body.roomId === request.params.roomId) {
      return reply.status(400).send({ error: "target room must differ from source room" });
    }

    const result = store.migrateUser(request.params.roomId, request.params.userId, {
      roomId: body.roomId,
      userId: body.userId,
    });
    switch (result) {
      case "from-room-not-found":
        return reply.status(404).send({ error: "unknown source roomId" });
      case "to-room-not-found":
        return reply.status(404).send({ error: "unknown target roomId" });
      case "user-not-found":
        return reply.status(404).send({ error: "unknown userId in this room" });
      case "user-already-deleted":
        return reply.status(410).send({ error: "user is soft-deleted" });
      case "target-id-exists":
        return reply.status(409).send({ error: "target userId already registered" });
      case "migrated":
        return reply.status(201).send(toProfile(store.userById(body.userId)!));
    }
  });

  app.post<{ Body: { exchangeCode: string } }>(
    "/api/exchange-code",
    async (request, reply) => {
      const { exchangeCode } = request.body ?? ({} as never);
      if (typeof exchangeCode !== "string" || exchangeCode.length < 4) {
        return reply.status(400).send({ error: "exchangeCode (≥4 chars) required" });
      }
      // Native wrapper in dev/test calls this to mint a live code. In
      // production the phone mints + displays it locally and only syncs via WS.
      store.activateExchange(exchangeCode.toUpperCase());
      return reply.send({ status: "active" });
    },
  );

  if (cfg.webDistDir) {
    app.register(fastifyStatic, { root: cfg.webDistDir });
    app.setNotFoundHandler(async (request, reply) => {
      if (request.raw.url?.startsWith("/api/") || request.raw.url?.startsWith("/ws")) {
        return reply.status(404).send({ error: "not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}

export async function startServer(cfg: Config): Promise<void> {
  const store = new ClaimStore();
  const app = buildServer(cfg, store);

  await app.ready();
  // app.server is a standard node:http Server — ws attaches to it directly,
  // both HTTP routes and WS share one port.
  attachWebSocketHub(app.server, store);

  await app.listen({ port: cfg.port, host: "0.0.0.0" });

  process.on("SIGINT", async () => {
    store.close();
    await app.close();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    store.close();
    await app.close();
    process.exit(0);
  });
}

// Read package.json version natively — no build step concerns.
let pkgVersion = "0.0.0";
try {
  pkgVersion = JSON.parse(
    readFileSync(path.resolve(__dirname, "../package.json"), "utf-8"),
  ).version as string;
} catch {}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const webDist = process.env.WEB_DIST_DIR;
  startServer({
    port: Number(process.env.PORT ?? 8787),
    webDistDir: webDist ? path.resolve(webDist) : undefined,
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { pkgVersion };
