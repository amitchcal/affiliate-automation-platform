// npm run test:db: runs scripts/test-db.sh, the database rule tests.
// With psql on this machine it runs there; otherwise inside a throwaway
// postgres:16 Docker container that is removed afterwards. It never connects
// to the local Supabase test stack or to the hosted project.
import { spawnSync } from "node:child_process";
import { fail, ROOT } from "./e2e-lib.mjs";

const SUITES = 7;

function hasPsql() {
  return spawnSync("psql", ["--version"], { stdio: "ignore" }).status === 0;
}

export function runDbTests() {
  let result;
  if (hasPsql()) {
    result = spawnSync("bash", ["scripts/test-db.sh"], { cwd: ROOT, encoding: "utf8" });
  } else {
    // Start PostgreSQL in the container, wait for it, then run the script there.
    const inner = [
      "docker-entrypoint.sh postgres >/tmp/pg.log 2>&1 &",
      "for i in $(seq 1 60); do pg_isready -q -U postgres && break; sleep 1; done",
      "sleep 2; pg_isready -q -U postgres || { cat /tmp/pg.log; exit 1; }",
      "tr -d '\\r' < scripts/test-db.sh > /tmp/test-db.sh",
      "PGUSER=postgres PGHOST=/var/run/postgresql bash /tmp/test-db.sh",
    ].join("\n"); // One command per line: "&;" would be a bash syntax error.
    result = spawnSync(
      "docker",
      ["run", "--rm", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "-v", `${ROOT}:/work:ro`, "-w", "/work", "postgres:16", "bash", "-c", inner],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
  }
  if (result.error) fail(`the database tests could not start: ${result.error.message}`);
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const passed = output.split("\n").filter((line) => /PASSED/.test(line));
  for (const line of output.split("\n").filter((l) => /PASSED|ERROR|FAILED/.test(l))) console.log(`   ${line.trim()}`);
  if (result.status !== 0 || passed.length !== SUITES) {
    console.error(output.slice(-4000));
    return 1;
  }
  return 0;
}

if (process.argv[1]?.endsWith("test-db.mjs")) process.exit(runDbTests());
