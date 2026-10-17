// The end-to-end safety guard (increment 5.1). The tests must reach only this
// project's local test stack at http://127.0.0.1:54421. Port 54321 belongs to
// another local project (interior-ai); the hosted project is never used.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appEnv, configRefusal, dbUrlRefusal, LOCAL_SUPABASE_URL, ROOT, supabaseUrlRefusal } from "./e2e-lib.mjs";

describe("Supabase address guard", () => {
  it("accepts only the test stack's address", () => {
    expect(LOCAL_SUPABASE_URL).toBe("http://127.0.0.1:54421");
    expect(supabaseUrlRefusal("http://127.0.0.1:54421")).toBeNull();
  });

  it("refuses port 54321, which interior-ai uses", () => {
    expect(supabaseUrlRefusal("http://127.0.0.1:54321")).toMatch(/54321.*interior-ai/);
    expect(supabaseUrlRefusal("http://localhost:54321")).toMatch(/interior-ai/);
  });

  it("refuses the hosted project and any hosted Supabase address", () => {
    expect(supabaseUrlRefusal("https://ktucieqhbkqktomigrsz.supabase.co")).toMatch(/hosted/);
    expect(supabaseUrlRefusal("https://abcdefghijklmnop.supabase.co")).toMatch(/hosted/);
  });

  it("refuses near misses: other host names, schemes, paths and empty values", () => {
    for (const url of ["http://localhost:54421", "https://127.0.0.1:54421", "http://127.0.0.1:54421/", "http://127.0.0.1:5442", "", undefined]) {
      expect(supabaseUrlRefusal(url), String(url)).not.toBeNull();
    }
  });
});

describe("database address guard (the reset target)", () => {
  it("accepts only the test stack's database on 127.0.0.1:54422", () => {
    expect(dbUrlRefusal("postgresql://postgres:postgres@127.0.0.1:54422/postgres")).toBeNull();
  });

  it("refuses interior-ai's database on 54322 and any hosted database", () => {
    expect(dbUrlRefusal("postgresql://postgres:postgres@127.0.0.1:54322/postgres")).not.toBeNull();
    expect(dbUrlRefusal("postgresql://postgres:x@db.ktucieqhbkqktomigrsz.supabase.co:5432/postgres")).not.toBeNull();
    expect(dbUrlRefusal("not a url")).not.toBeNull();
  });
});

describe("e2e/supabase/config.toml guard", () => {
  const config = readFileSync(path.join(ROOT, "e2e", "supabase", "config.toml"), "utf8");

  it("the committed configuration puts the test stack on 54421 and 54422", () => {
    expect(configRefusal(config)).toBeNull();
  });

  it("refuses a configuration that would reach port 54321 or 54322", () => {
    expect(configRefusal(config.replace(/^port = 54421$/m, "port = 54321"))).toMatch(/54321/);
    expect(configRefusal(config.replace(/^port = 54422$/m, "port = 54322"))).toMatch(/54322/);
    expect(configRefusal(config.replace(/^project_id = .*$/m, 'project_id = "interior-ai"'))).toMatch(/interior-ai/);
  });

  it("the committed configuration catches every email in the local mail catcher on 54424", () => {
    expect(config).toMatch(/^\[local_smtp\]\s*\r?\nenabled = true/m);
    expect(config).not.toMatch(/^\[auth\.email\.smtp\]/m);
  });

  it("refuses a real mail server, or a mail catcher outside the test stack's ports", () => {
    const realSmtp = `${config}\n[auth.email.smtp]\nenabled = true\nhost = "smtp.resend.com"\nport = 465\n[end]\n`;
    expect(configRefusal(realSmtp)).toMatch(/real mail server/);
    expect(configRefusal(config.replace(/^port = 54424$/m, "port = 54324"))).toMatch(/mail catcher on port 54324/);
  });
});

describe("the service role key given to the application under test", () => {
  const run = { supabaseUrl: "http://127.0.0.1:54421", anonKey: "anon", preparedAt: "", users: {} } as never;

  it("is passed only when given, under its server-only name, never as NEXT_PUBLIC_", () => {
    expect(appEnv(run).SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    const env = appEnv(run, "local-key");
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe("local-key");
    expect(Object.entries(env).filter(([name, value]) => name.startsWith("NEXT_PUBLIC_") && value === "local-key")).toEqual([]);
  });

  it("does not pass on the test runner's own copy of the key", () => {
    process.env.E2E_SERVICE_KEY = "runner-copy";
    try {
      expect(appEnv(run, "local-key").E2E_SERVICE_KEY).toBeUndefined();
    } finally {
      delete process.env.E2E_SERVICE_KEY;
    }
  });

  it("is refused with any address but the test stack's", () => {
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e",
        "const m = await import('./scripts/e2e-lib.mjs'); m.appEnv({ supabaseUrl: 'http://127.0.0.1:54321', anonKey: 'x' }, 'k'); console.log('NOT REFUSED')"],
      { cwd: ROOT, encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain("NOT REFUSED");
  });
});

describe("the real entry points refuse a run prepared for port 54321", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "affiqube-guard-"));
  const runFile = path.join(dir, "run.json");
  writeFileSync(
    runFile,
    JSON.stringify({ supabaseUrl: "http://127.0.0.1:54321", anonKey: "x", preparedAt: "", users: {} }),
  );
  const env = { ...process.env, E2E_RUN_FILE: runFile };

  it("readRun() stops", () => {
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", "await (await import('./scripts/e2e-lib.mjs')).readRun(); console.log('NOT REFUSED')"],
      { cwd: ROOT, env, encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain("NOT REFUSED");
    expect(result.stderr).toMatch(/STOPPED:.*54321.*interior-ai/s);
  });

  it("Playwright stops before any test or server starts", () => {
    const result = spawnSync(process.execPath, [path.join(ROOT, "node_modules/@playwright/test/cli.js"), "test", "--list"], {
      cwd: ROOT,
      env,
      encoding: "utf8",
    });
    rmSync(dir, { recursive: true, force: true });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/STOPPED:.*54321/s);
    expect(result.stdout).not.toMatch(/spec\.ts/);
  }, 60_000);
});
