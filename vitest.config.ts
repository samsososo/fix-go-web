import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    hookTimeout: 30_000,
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
