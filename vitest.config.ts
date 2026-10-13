import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // The server-only guard throws in Node.js test environments; replace with a no-op.
      "server-only": path.resolve(__dirname, "src/test-utils/server-only.ts"),
    },
  },
  test: { include: ["src/**/*.test.ts"] },
});
