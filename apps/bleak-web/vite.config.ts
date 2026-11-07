import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const relayOrigin = process.env.RELAY_ORIGIN ?? "http://localhost:4000";

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 5173,
    // Forward same-origin /api and /ws to the relay (bleak-node) in dev.
    // Override the target with RELAY_ORIGIN=http://localhost:<port>.
    proxy: {
      "/api": { target: relayOrigin, changeOrigin: true },
      "/ws": { target: relayOrigin, changeOrigin: true, ws: true },
    },
  },
});
