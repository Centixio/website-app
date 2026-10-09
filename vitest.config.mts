import { defineConfig } from "vitest/config";
import path from "node:path";
import os from "node:os";

export default defineConfig({
  resolve: {
    alias: [
      { find: "server-only", replacement: path.resolve(import.meta.dirname, "tests/stubs/server-only.ts") },
      { find: /^@\//, replacement: `${path.resolve(import.meta.dirname, "src")}/` },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 60000,
    env: { CENTIXIO_DEMO_DIR: path.join(os.tmpdir(), `centixio-test-${process.pid}`), DEMO_SESSION_SECRET: "test-secret", NODE_ENV: "test" },
  },
});
