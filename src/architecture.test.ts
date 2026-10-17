import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The layering rules in CLAUDE.md ("Architecture"), checked on every test run:
 *   1. Core never depends on a module.
 *   2. Modules never depend on each other.
 * Only src/app and src/modules/index.ts may bring core and modules together.
 */

const SRC = path.resolve(__dirname);
const MODULES = ["affiliate", "dropshipping"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

/** Every module specifier a file imports or re-exports, resolved to a path under src where possible. */
function importsOf(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const specifiers = [...text.matchAll(/(?:from\s+|import\s*\(?\s*)["']([^"']+)["']/g)].map((match) => match[1]);
  return specifiers.map((specifier) => {
    if (specifier.startsWith("@/")) return path.join(SRC, specifier.slice(2));
    if (specifier.startsWith(".")) return path.resolve(path.dirname(file), specifier);
    return specifier;
  });
}

function violations(fromDir: string, forbiddenDirs: string[]): string[] {
  return sourceFiles(fromDir).flatMap((file) =>
    importsOf(file)
      .filter((target) => forbiddenDirs.some((dir) => target === dir || target.startsWith(dir + path.sep)))
      .map((target) => `${path.relative(SRC, file)} imports ${path.relative(SRC, target)}`),
  );
}

describe("architecture rules", () => {
  it("core imports no module", () => {
    expect(violations(path.join(SRC, "core"), [path.join(SRC, "modules")])).toEqual([]);
  });

  for (const module of MODULES) {
    it(`the ${module} module imports no other module`, () => {
      const others = MODULES.filter((other) => other !== module).map((other) => path.join(SRC, "modules", other));
      const moduleIndex = path.join(SRC, "modules", "index");
      expect(violations(path.join(SRC, "modules", module), [...others, moduleIndex])).toEqual([]);
    });
  }

  it("the service role key is never read under a browser-visible name", () => {
    const offenders = sourceFiles(SRC).filter((file) => /NEXT_PUBLIC_[A-Z_]*SERVICE/.test(readFileSync(file, "utf8")));
    expect(offenders.map((file) => path.relative(SRC, file))).toEqual([]);
  });

  it("only server code imports the server-only email sender (core/supabase/admin)", () => {
    const admin = path.join(SRC, "core", "supabase", "admin");
    const importers = sourceFiles(SRC).filter((file) => importsOf(file).includes(admin));
    expect(importers.length).toBeGreaterThan(0);
    for (const file of importers) {
      expect(readFileSync(file, "utf8"), path.relative(SRC, file)).toMatch(/^\s*["']use server["']/);
    }
    expect(readFileSync(`${admin}.ts`, "utf8")).toMatch(/^import "server-only";/);
  });

  it("finds imports at all (guards against a scan that silently checks nothing)", () => {
    const coreFiles = sourceFiles(path.join(SRC, "core"));
    expect(coreFiles.length).toBeGreaterThan(5);
    expect(coreFiles.flatMap(importsOf).some((target) => target.includes(path.join("core", "scoring")))).toBe(true);
  });
});
