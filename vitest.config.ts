import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    // Default to node for service/lib unit tests. Component tests opt-in to
    // jsdom via the glob below.
    environment: "node",
    environmentMatchGlobs: [["src/components/**/*.test.{ts,tsx}", "jsdom"]],
    setupFiles: ["./tests/setup.ts"],
    include: [
      "src/**/*.test.{ts,tsx}",
      "tests/**/*.test.{ts,tsx}",
      "tests/perf/**/*.bench.ts",
    ],
    globals: false,
    reporters: ["default"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
