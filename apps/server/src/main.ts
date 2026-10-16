import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { attachWebSocketHub } from "./hub.js";
import { ClaimStore } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Config {
  port: number;
  webDistDir?: string;
}

function buildServer(cfg: Config, store: ClaimStore): FastifyInstance {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ status: "ok" }));

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
