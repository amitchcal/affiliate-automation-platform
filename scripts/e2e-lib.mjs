// Shared by the end-to-end scripts. Runs tools through Node directly (no shell),
// so the commands behave the same in PowerShell, Git Bash and CI.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * The repository root: the nearest folder upwards from the working directory
 * whose package.json is this project's. (Not import.meta: Playwright loads this
 * file through its own CommonJS loader, where import.meta does not exist.)
 */
function findRoot() {
  let dir = process.cwd();
  for (;;) {
    const manifest = path.join(dir, "package.json");
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, "utf8")).name === "affiqube") return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("Run this from inside the Affiqube repository.");
    dir = parent;
  }
}
export const ROOT = findRoot();

/**
 * The only Supabase address the end-to-end run accepts: this project's own
 * local test stack, on ports 54421-54427. Port 54321 belongs to another local
 * project (interior-ai) and is refused, as is any hosted address.
 */
export const LOCAL_SUPABASE_URL = "http://127.0.0.1:54421";
export const LOCAL_DB_PORT = 54422;
/** Ports of the default local Supabase stack, used by other projects on this machine. */
export const FORBIDDEN_PORTS = [54321, 54322];
/** The hosted project's reference. Its appearance in a test build stops the run. */
export const HOSTED_PROJECT_REF = "ktucieqhbkqktomigrsz";

export const E2E_WORKDIR = "e2e"; // holds supabase/config.toml, with no migrations
export const E2E_PROJECT_ID = "affiqube-e2e";
export const DB_CONTAINER = `supabase_db_${E2E_PROJECT_ID}`;
// git ignores e2e/.run/. E2E_RUN_FILE overrides it only for the guard's own tests;
// whatever file is read, readRun() still refuses any address but the test stack's.
export const RUN_FILE = process.env.E2E_RUN_FILE || path.join(ROOT, "e2e", ".run", "run.json");
export const DIST_DIR = ".next-e2e";
export const APP_PORT = 3100;
/** The local mail catcher (Mailpit). Every email the test stack sends lands here; none leaves the machine. */
export const MAIL_PORT = 54424;
export const MAIL_URL = `http://127.0.0.1:${MAIL_PORT}`;

const BIN = {
  supabase: path.join(ROOT, "node_modules", "supabase", "dist", "supabase.js"),
  next: path.join(ROOT, "node_modules", "next", "dist", "bin", "next"),
  playwright: path.join(ROOT, "node_modules", "@playwright", "test", "cli.js"),
  vitest: path.join(ROOT, "node_modules", "vitest", "vitest.mjs"),
  tsc: path.join(ROOT, "node_modules", "typescript", "bin", "tsc"),
};

/** Runs a Node-based tool from node_modules. Returns its exit code (or its output with capture). */
export function tool(name, args, { env, capture = false, input } = {}) {
  const result = spawnSync(process.execPath, [BIN[name], ...args], {
    cwd: ROOT,
    env: env ?? process.env,
    stdio: capture ? ["pipe", "pipe", "pipe"] : input ? ["pipe", "inherit", "inherit"] : "inherit",
    input,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return capture ? { status: result.status, stdout: result.stdout, stderr: result.stderr } : result.status;
}

/** Runs docker with the given arguments. */
export function docker(args, { capture = true, input } = {}) {
  const result = spawnSync("docker", args, {
    cwd: ROOT,
    stdio: capture ? ["pipe", "pipe", "pipe"] : ["pipe", "inherit", "inherit"],
    input,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

export function fail(message) {
  console.error(`\nSTOPPED: ${message}\n`);
  process.exit(1);
}

/**
 * The guard. Returns null for the test stack's address, otherwise the reason
 * it is refused. Exact match only: no other host, port, or scheme passes.
 */
export function supabaseUrlRefusal(url) {
  if (url === LOCAL_SUPABASE_URL) return null;
  const text = String(url ?? "");
  if (text.includes(HOSTED_PROJECT_REF) || /supabase\.(co|com|in)\b/i.test(text)) {
    return `"${text}" is a hosted Supabase address. Tests never use the hosted project.`;
  }
  if (FORBIDDEN_PORTS.some((port) => new RegExp(`:${port}(?!\\d)`).test(text))) {
    return `"${text}" uses port 54321 or 54322, which belong to another local Supabase project (interior-ai). The test stack uses ${LOCAL_SUPABASE_URL}.`;
  }
  return `"${text}" is not the test stack's address, ${LOCAL_SUPABASE_URL}.`;
}

/**
 * Returns null when a database connection string points at the test stack's
 * database (127.0.0.1:54422), otherwise the reason it is refused.
 */
export function dbUrlRefusal(dbUrl) {
  let parsed;
  try {
    parsed = new URL(String(dbUrl));
  } catch {
    return `"${dbUrl}" is not a database address.`;
  }
  if (parsed.hostname === "127.0.0.1" && Number(parsed.port) === LOCAL_DB_PORT) return null;
  return `the database address ${parsed.hostname}:${parsed.port} is not the test stack's database, 127.0.0.1:${LOCAL_DB_PORT}.`;
}

/**
 * Returns null when e2e/supabase/config.toml puts the API on 54421 and the
 * database on 54422, otherwise the reason it is refused. Checked before any
 * Supabase command runs, so a reset can only ever reach the test stack.
 */
export function configRefusal(configText) {
  const section = (name) => {
    const match = configText.match(new RegExp(`^\\[${name.replace(".", "\\.")}\\]\\s*$([\\s\\S]*?)(?=^\\[)`, "m"));
    return match ? match[1] : "";
  };
  const port = (name) => Number(section(name).match(/^port\s*=\s*(\d+)/m)?.[1]);
  const projectId = configText.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  if (projectId !== E2E_PROJECT_ID) return `config.toml's project_id is "${projectId}", not "${E2E_PROJECT_ID}".`;
  if (port("api") !== 54421) return `config.toml puts the API on port ${port("api")}, not 54421.`;
  if (port("db") !== LOCAL_DB_PORT) return `config.toml puts the database on port ${port("db")}, not ${LOCAL_DB_PORT}.`;
  // Email goes only to the local mail catcher, never to a real mail server (increment 6).
  if (/^enabled\s*=\s*true/m.test(section("local_smtp")) && port("local_smtp") !== MAIL_PORT) {
    return `config.toml puts the mail catcher on port ${port("local_smtp")}, not ${MAIL_PORT}.`;
  }
  if (/^\[auth\.email\.smtp\]/m.test(configText)) {
    return "config.toml configures a real mail server ([auth.email.smtp]). The tests never send real email.";
  }
  return null;
}

/** Stops the run unless the address is the test stack's. */
export function assertLocalUrl(url) {
  const refusal = supabaseUrlRefusal(url);
  if (refusal) fail(`the end-to-end tests run only against the local test stack. ${refusal}`);
}

/** Stops the run unless e2e/supabase/config.toml targets the test stack's ports. */
export function assertE2eConfig() {
  const refusal = configRefusal(readFileSync(path.join(ROOT, E2E_WORKDIR, "supabase", "config.toml"), "utf8"));
  if (refusal) fail(refusal);
}

/**
 * The local test stack's service role key, read from `supabase status` for
 * this project's own stack, kept in memory and never written. Stops unless the
 * stack's address is the test stack's.
 */
export function localServiceKey() {
  const result = tool("supabase", ["status", "--workdir", E2E_WORKDIR, "--output", "json"], { capture: true });
  const start = result.stdout.indexOf("{");
  if (result.status !== 0 || start < 0) fail("could not read the local Supabase status.");
  const info = JSON.parse(result.stdout.slice(start));
  assertLocalUrl(info.API_URL);
  if (!info.SERVICE_ROLE_KEY) fail("the local Supabase status did not include its service role key.");
  return info.SERVICE_ROLE_KEY;
}

/** The settings written by e2e-db.mjs for this run. */
export function readRun() {
  if (!existsSync(RUN_FILE)) fail("no test run is prepared. Run: npm run test:e2e");
  const run = JSON.parse(readFileSync(RUN_FILE, "utf8"));
  assertLocalUrl(run.supabaseUrl);
  return run;
}

/**
 * The settings the application under test receives. Every value is passed in
 * directly, and __NEXT_PROCESSED_ENV tells Next.js its environment is already
 * loaded, so .env.local (which points at the hosted project) is never read.
 * CLICKBANK_API_KEY is set empty, so no import can reach ClickBank.
 * The local stack's service role key is passed only together with the local
 * address, so the application under test can send invitations into the mail
 * catcher and nowhere else.
 */
export function appEnv(run, serviceKey) {
  assertLocalUrl(run.supabaseUrl);
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("NEXT_PUBLIC_") || key.startsWith("SUPABASE_") || key === "CLICKBANK_API_KEY" || key === "E2E_SERVICE_KEY") delete env[key];
  }
  return {
    ...env,
    __NEXT_PROCESSED_ENV: "true",
    NEXT_DIST_DIR: DIST_DIR,
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_SUPABASE_URL: run.supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: run.anonKey,
    ADMIN_HOSTS: "localhost,127.0.0.1",
    CLICKBANK_API_KEY: "",
    ...(serviceKey ? { SUPABASE_SERVICE_ROLE_KEY: serviceKey } : {}),
  };
}
