import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Vitest runs in Node, which is a legitimate server context. Alias to
      // the package's no-op "react-server" build so `import "server-only"`
      // doesn't throw its browser-boundary guard during unit tests; the real
      // Next.js build keeps the guard via its own webpack/turbopack config.
      "server-only": path.resolve(__dirname, "./node_modules/server-only/empty.js"),
    },
  },
});
