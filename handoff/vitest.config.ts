import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    passWithNoTests: true,
    exclude: ["**/node_modules/**", ".next/**", ".open-next/**", "src/agent/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
