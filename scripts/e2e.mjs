// npm run test:e2e: prepares the local test database, builds the application
// against it into .next-e2e, checks the build cannot reach the hosted project,
// and runs the Playwright tests. Extra arguments go to Playwright, for example:
//   npm run test:e2e -- e2e/site.spec.ts
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { prepareDatabase } from "./e2e-db.mjs";
import { appEnv, DIST_DIR, fail, HOSTED_PROJECT_REF, LOCAL_SUPABASE_URL, readRun, ROOT, tool } from "./e2e-lib.mjs";

/** Every built file that could carry the Supabase address: none may name the hosted project. */
function scanBuild() {
  const dir = path.join(ROOT, DIST_DIR);
  let foundLocal = false;
  const walk = (folder) => {
    for (const name of readdirSync(folder)) {
      const full = path.join(folder, name);
      if (name === "cache") continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(js|json|html|rsc)$/.test(name)) {
        const text = readFileSync(full, "utf8");
        if (text.includes(HOSTED_PROJECT_REF)) fail(`the test build names the hosted project (${path.relative(ROOT, full)}). Nothing was tested.`);
        if (text.includes(LOCAL_SUPABASE_URL)) foundLocal = true;
      }
    }
  };
  if (!existsSync(dir)) fail(`${DIST_DIR} was not built.`);
  walk(dir);
  if (!foundLocal) fail(`the test build does not contain ${LOCAL_SUPABASE_URL}, so its Supabase address is unknown.`);
}

export async function runE2e(playwrightArgs = []) {
  await prepareDatabase();
  const run = readRun();

  console.log(`\n== Building the application against ${run.supabaseUrl} into ${DIST_DIR}`);
  if (tool("next", ["build"], { env: appEnv(run) }) !== 0) fail("the test build failed.");
  scanBuild();
  console.log(`   build checked: it uses ${LOCAL_SUPABASE_URL} and never the hosted project`);

  console.log("\n== Running the end-to-end tests");
  return tool("playwright", ["test", ...playwrightArgs]);
}

if (process.argv[1]?.endsWith("e2e.mjs")) {
  const code = await runE2e(process.argv.slice(2));
  console.log(
    `\nScreenshots: test-results/e2e/screens\nHTML report: test-results/e2e/report/index.html` +
      `  (open with: npx playwright show-report test-results/e2e/report)`,
  );
  process.exit(code);
}
