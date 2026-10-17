import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import fastifyStatic from "@fastify/static";
import type { UserProfile } from "@ble-id/shared-types";
import { attachWebSocketHub } from "./hub.js";
import { ClaimStore, type UserRow } from "./store.js";
import { USER_FIELD_LIMITS } from "@ble-id/shared-types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Config {
  port: number;
  webDistDir?: string;
}

function toProfile(row: UserRow): UserProfile {
  return {
    userId: row.user_id,
    publicBio: row.public_bio,
    privateBio: row.private_bio,
    meta: row.meta,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Rejects non-string / over-limit text fields for user payloads. */
function validateUserText(
  patch: Record<string, unknown>,
  reply: FastifyReply,
): { publicBio?: string; privateBio?: string; meta?: string } | null {
  const out: { publicBio?: string; privateBio?: string; meta?: string } = {};
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

  // -- Users ---------------------------------------------------------------

  app.post<{ Body: { userId: string; publicBio?: string; privateBio?: string; meta?: string } }>(
    "/api/users",
    async (request, reply) => {
      const body = request.body ?? ({} as never);
      if (typeof body.userId !== "string" || body.userId.length === 0 || body.userId.length > 32) {
        return reply.status(400).send({ error: "userId must be 1-32 chars" });
      }
      const fields = validateUserText(body, reply);
      if (fields === null) return reply;

      const result = store.createUser({ userId: body.userId, ...fields });
      if (result === "exists") {
        return reply.status(409).send({ error: "userId already registered" });
      }
      return reply.status(201).send(toProfile(store.userById(body.userId)!));
    },
  );

  app.patch<{ Params: { userId: string }; Body: { publicBio?: string; privateBio?: string; meta?: string } }>(
    "/api/users/:userId",
    async (request, reply) => {
      const fields = validateUserText(request.body ?? {}, reply);
      if (fields === null) return reply;

      const result = store.updateUser(request.params.userId, fields);
      if (result === "not-found") {
        return reply.status(404).send({ error: "unknown userId" });
      }
      if (result === "already-deleted") {
        return reply.status(410).send({ error: "user is soft-deleted" });
      }
      return reply.send(toProfile(store.userById(request.params.userId)!));
    },
  );

  app.get<{ Params: { userId: string } }>("/api/users/:userId", async (request, reply) => {
    const row = store.userById(request.params.userId);
    if (!row) return reply.status(404).send({ error: "unknown userId" });
    return reply.send(toProfile(row));
  });

  // Soft delete — tombstones the profile; the row stays in the DB.
  app.delete<{ Params: { userId: string } }>("/api/users/:userId", async (request, reply) => {
    const { userId } = request.params;
    const result = store.softDeleteUser(userId);
    if (result === "not-found") return reply.status(404).send({ error: "unknown userId" });
    if (result === "already-deleted") return reply.status(410).send({ error: "already soft-deleted" });
    return reply.status(204).send();
  });

  // Force delete — separate method/route, wipes the row outright.
  app.delete<{ Params: { userId: string } }>(
    "/api/users/:userId/force",
    async (request, reply) => {
      const result = store.forceDeleteUser(request.params.userId);
      if (result === "not-found") return reply.status(404).send({ error: "unknown userId" });
      return reply.status(204).send();
    },
  );

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
