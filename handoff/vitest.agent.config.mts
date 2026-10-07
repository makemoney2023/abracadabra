import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.agent.jsonc", environment: "test" },
    }),
  ],
  test: {
    include: ["src/agent/**/*.test.ts"],
  },
});
