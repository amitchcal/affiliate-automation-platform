import "server-only";
import { readFileSync } from "node:fs";
import { Resolver } from "node:dns/promises";
import type { DnsResolver } from "./dns-check";

/**
 * The resolver the domain check uses (S-01): Node's DNS resolver, or, in the
 * end-to-end tests only, a fake that answers from a file. The fake is refused
 * unless the application points at the local test stack, so it can never
 * stand in for real DNS against the hosted project (same guard as the
 * service role key in the tests).
 */

export const LOCAL_TEST_STACK = "http://127.0.0.1:54421";

/** Whether a fake resolver may be used with these settings. */
export function fakeResolverAllowed(env: Record<string, string | undefined>): boolean {
  return Boolean(env.E2E_DNS_FAKE_FILE) && env.NEXT_PUBLIC_SUPABASE_URL === LOCAL_TEST_STACK;
}

interface FakeRecords {
  [name: string]: { txt?: string[]; cname?: string[]; a?: string[]; aaaa?: string[] };
}

/** Answers from a JSON file of records by name; a missing name or type answers "no record". */
export function fakeResolver(records: FakeRecords): DnsResolver {
  const answer = <T>(name: string, pick: (entry: FakeRecords[string]) => T[] | undefined): Promise<T[]> => {
    const values = pick(records[name.toLowerCase()] ?? {});
    if (!values || values.length === 0) return Promise.reject(Object.assign(new Error("no record"), { code: "ENODATA" }));
    return Promise.resolve(values);
  };
  return {
    resolveTxt: (name) => answer(name, (entry) => entry.txt?.map((value) => [value])),
    resolveCname: (name) => answer(name, (entry) => entry.cname),
    resolve4: (name) => answer(name, (entry) => entry.a),
    resolve6: (name) => answer(name, (entry) => entry.aaaa),
  };
}

export function domainResolver(env: Record<string, string | undefined> = process.env): DnsResolver {
  if (env.E2E_DNS_FAKE_FILE) {
    if (!fakeResolverAllowed(env)) {
      throw new Error("STOP: the fake DNS resolver is for the local test stack only.");
    }
    return fakeResolver(JSON.parse(readFileSync(env.E2E_DNS_FAKE_FILE, "utf8")) as FakeRecords);
  }
  const resolver = new Resolver({ timeout: 5_000, tries: 2 });
  return {
    resolveTxt: (name) => resolver.resolveTxt(name),
    resolveCname: (name) => resolver.resolveCname(name),
    resolve4: (name) => resolver.resolve4(name),
    resolve6: (name) => resolver.resolve6(name),
  };
}
