import { defineConfig, devices } from "@playwright/test";
import { APP_PORT, appEnv, readRun } from "./scripts/e2e-lib.mjs";

// readRun() stops here unless the prepared run points at the local test stack
// (http://127.0.0.1:54421). Prepare it with: npm run test:e2e
const run = readRun();

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.ts",
  // The tests share one database, so they run one at a time, in file order.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: "test-results/e2e/artifacts",
  reporter: [["list"], ["html", { outputFolder: "test-results/e2e/report", open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://localhost:${APP_PORT}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `node node_modules/next/dist/bin/next start -p ${APP_PORT}`,
    url: `http://localhost:${APP_PORT}/login`,
    env: appEnv(run),
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
