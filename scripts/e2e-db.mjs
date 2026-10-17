// Prepares the local database for the end-to-end tests (increment 5.1).
//
//   1. starts the local Supabase stack in Docker (config in e2e/supabase, no migrations);
//   2. resets its database to empty, so every run starts from the same state;
//   3. creates the test users through the local sign-in service, each with a new random password;
//   4. applies supabase/migrations 0001 to 0006 in order (0002 needs the owner's account first);
//   5. loads e2e/seed.sql;
//   6. writes the address, the local anon key and the users to e2e/.run/run.json, which git ignores.
//
// It refuses to continue unless e2e/supabase/config.toml uses ports 54421 (API) and
// 54422 (database), the stack answers at http://127.0.0.1:54421, and the containers on
// those ports belong to this project. Port 54321 (interior-ai) and the hosted project
// are never touched. The hosted project is never touched.
import { createHash, randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  assertE2eConfig,
  assertLocalUrl,
  DB_CONTAINER,
  dbUrlRefusal,
  docker,
  E2E_PROJECT_ID,
  E2E_WORKDIR,
  fail,
  LOCAL_DB_PORT,
  LOCAL_SUPABASE_URL,
  MAIL_PORT,
  ROOT,
  RUN_FILE,
  tool,
} from "./e2e-lib.mjs";

export const TEST_USERS = {
  owner: "amit.chakraborty@affilyvault.com", // the address 0002 makes the owner
  clientAdmin: "e2e.client.admin@example.com",
  clientViewer: "e2e.client.viewer@example.com",
  otherAdmin: "e2e.other.admin@example.com",
};

const step = (text) => console.log(`\n== ${text}`);

// The stack reads config.toml and the email templates only when it starts. If
// they changed since this project's stack was started, it is restarted.
const STACK_STAMP = path.join(path.dirname(RUN_FILE), "stack-config.sha256");
function stackConfigHash() {
  const hash = createHash("sha256");
  hash.update(readFileSync(path.join(ROOT, E2E_WORKDIR, "supabase", "config.toml")));
  const templates = path.join(ROOT, "supabase", "email-templates");
  if (existsSync(templates)) {
    for (const name of readdirSync(templates).sort()) hash.update(name).update(readFileSync(path.join(templates, name)));
  }
  return hash.digest("hex");
}

function checkDocker() {
  if (docker(["info", "--format", "{{.ServerVersion}}"]).status !== 0) {
    fail("Docker is not running. Start Docker Desktop and run this again.");
  }
}

/**
 * The test stack's ports must be free or already ours, so the tests never talk
 * to another project's stack (interior-ai runs on 54321-54327).
 */
function checkPortOwner() {
  for (const port of [54421, LOCAL_DB_PORT, MAIL_PORT]) {
    const names = docker(["ps", "--filter", `publish=${port}`, "--format", "{{.Names}}"]).stdout.trim().split(/\s+/).filter(Boolean);
    const other = names.find((name) => !name.endsWith(`_${E2E_PROJECT_ID}`));
    if (other) fail(`port ${port} is in use by "${other}", which is not this project's test stack. Free that port, then run this again.`);
  }
}

function status() {
  const result = tool("supabase", ["status", "--workdir", E2E_WORKDIR, "--output", "json"], { capture: true });
  if (result.status !== 0) return null;
  const start = result.stdout.indexOf("{");
  return start >= 0 ? JSON.parse(result.stdout.slice(start)) : null;
}

function psqlFile(file) {
  const sql = readFileSync(path.join(ROOT, file), "utf8");
  const result = docker(
    ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-f", "-"],
    { input: sql },
  );
  if (result.status !== 0) fail(`${file} did not apply:\n${result.stderr || result.stdout}`);
}

async function createUser(url, serviceKey, email, password) {
  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!response.ok) fail(`the test user ${email} was not created: ${response.status} ${await response.text()}`);
}

export async function prepareDatabase() {
  step("Checking Docker and the local Supabase stack");
  assertE2eConfig();
  checkDocker();
  checkPortOwner();
  // The CLI reads templates only from inside e2e/, so the repository's own
  // templates (supabase/email-templates, the one source) are copied there.
  const templateCopies = path.join(ROOT, E2E_WORKDIR, "supabase", "templates");
  mkdirSync(templateCopies, { recursive: true });
  for (const name of readdirSync(path.join(ROOT, "supabase", "email-templates"))) {
    copyFileSync(path.join(ROOT, "supabase", "email-templates", name), path.join(templateCopies, name));
  }
  const configHash = stackConfigHash();
  const startedWith = existsSync(STACK_STAMP) ? readFileSync(STACK_STAMP, "utf8").trim() : "";
  if (startedWith !== configHash) {
    console.log("   the test stack's settings changed since it started: restarting this project's stack");
    tool("supabase", ["stop", "--workdir", E2E_WORKDIR]); // stops only the project_id in e2e/supabase/config.toml
  }
  if (tool("supabase", ["start", "--workdir", E2E_WORKDIR]) !== 0) fail("the local Supabase stack did not start.");
  mkdirSync(path.dirname(STACK_STAMP), { recursive: true });
  writeFileSync(STACK_STAMP, configHash);
  checkPortOwner();

  const info = status();
  if (!info) fail("could not read the local Supabase status.");
  assertLocalUrl(info.API_URL);
  const dbRefusal = dbUrlRefusal(info.DB_URL);
  if (dbRefusal) fail(`the reset was not run: ${dbRefusal}`);
  const anonKey = info.ANON_KEY;
  const serviceKey = info.SERVICE_ROLE_KEY; // local only, kept in memory, never written
  if (!anonKey || !serviceKey) fail("the local Supabase status did not include its keys.");

  step("Resetting the local database to empty");
  // --local with this workdir resets only the database in e2e/supabase/config.toml,
  // which assertE2eConfig() and dbUrlRefusal() have just confirmed is 127.0.0.1:54422.
  assertE2eConfig();
  if (tool("supabase", ["db", "reset", "--workdir", E2E_WORKDIR, "--local", "--no-seed"]) !== 0) {
    fail("the local database could not be reset.");
  }

  step("Creating the test users with new random passwords");
  const users = {};
  for (const [role, email] of Object.entries(TEST_USERS)) {
    const password = randomBytes(18).toString("base64url");
    await createUser(LOCAL_SUPABASE_URL, serviceKey, email, password);
    users[role] = { email, password };
  }

  step("Applying the migrations in order");
  const migrations = readdirSync(path.join(ROOT, "supabase", "migrations")).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  for (const file of migrations) {
    psqlFile(path.join("supabase", "migrations", file));
    console.log(`   applied ${file}`);
  }

  step("Loading e2e/seed.sql");
  psqlFile(path.join("e2e", "seed.sql"));

  mkdirSync(path.dirname(RUN_FILE), { recursive: true });
  writeFileSync(
    RUN_FILE,
    JSON.stringify({ supabaseUrl: LOCAL_SUPABASE_URL, anonKey, preparedAt: new Date().toISOString(), users }, null, 2),
  );
  console.log(`   test settings for this run written to ${path.relative(ROOT, RUN_FILE)} (ignored by git)`);
}

// Run directly (node scripts/e2e-db.mjs), not when imported by e2e.mjs.
if (process.argv[1]?.endsWith("e2e-db.mjs")) {
  await prepareDatabase();
}
