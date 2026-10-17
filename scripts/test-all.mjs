// npm run test:all: every test, in order, stopping at the first failure.
//   1. type check   2. unit tests   3. database tests   4. end-to-end tests
// Work is handed to the owner only when this passes (CLAUDE.md).
import { runE2e } from "./e2e.mjs";
import { tool } from "./e2e-lib.mjs";
import { runDbTests } from "./test-db.mjs";

const results = [];
const started = Date.now();

function summary() {
  console.log("\n================ Summary ================");
  for (const [name, ok] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  console.log(`Time: ${Math.round((Date.now() - started) / 1000)} s`);
  console.log("Screenshots: test-results/e2e/screens");
  console.log("HTML report: test-results/e2e/report/index.html  (npx playwright show-report test-results/e2e/report)");
}

async function step(name, action) {
  console.log(`\n################ ${name} ################`);
  const ok = (await action()) === 0;
  results.push([name, ok]);
  if (!ok) {
    summary();
    console.log(`\nStopped at: ${name}. Fix it before handing over.`);
    process.exit(1);
  }
}

await step("Type check", () => tool("tsc", ["--noEmit"]));
await step("Unit tests", () => tool("vitest", ["run"]));
await step("Database tests", () => runDbTests());
await step("End-to-end tests", () => runE2e());
summary();
console.log("\nAll tests passed.");
