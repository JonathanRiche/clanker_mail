import { cloudflare } from "@cloudflare/vite-plugin";
import { redwood } from "rwsdk/vite";
import { defineConfig } from "vite";

const wranglerConfigPath = process.env.CM_WRANGLER_CONFIG;

export default defineConfig({
  environments: {
    ssr: {},
  },
  plugins: [
    cloudflare({
      ...(wranglerConfigPath ? { configPath: wranglerConfigPath } : {}),
      viteEnvironment: { name: "worker" },
    }),
    redwood(),
  ],
});
