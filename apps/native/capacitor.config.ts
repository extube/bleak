import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.bleid.exchange",
  appName: "BLE ID Exchange",
  // Serve the prebuilt Svelte bundle from `dist` — see
  // Vite config; on mobile it's loaded from this directory at runtime.
  webDir: "dist",
  ios: {
    contentInset: "always",
  },
};

export default config;
