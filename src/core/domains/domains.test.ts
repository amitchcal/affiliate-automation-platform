import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHECK_MESSAGES, checkDomain, dnsTargets, evaluateDnsCheck, type DnsResolver } from "./dns-check";
import { HOST_MESSAGES, normaliseHost } from "./host";
import { domainResolver, fakeResolver, fakeResolverAllowed, LOCAL_TEST_STACK } from "./resolver";

const CODE = "0123456789abcdef0123456789abcdef";
const TARGETS = { cnames: ["cname.vercel-dns.com"], addresses: ["76.76.21.21"] };

describe("host names (S-01, addition 1)", () => {
  it("accepts public names, lower-cased, with punycode for international names", () => {
    expect(normaliseHost("Brand-A-Test.com")).toEqual({ ok: true, host: "brand-a-test.com" });
    expect(normaliseHost("  go.brand-a-test.com. ")).toEqual({ ok: true, host: "go.brand-a-test.com" });
    expect(normaliseHost("www.brand-a-test.com")).toEqual({ ok: true, host: "www.brand-a-test.com" });
    expect(normaliseHost("bücher.com")).toEqual({ ok: true, host: "xn--bcher-kva.com" });
    expect(normaliseHost("a1.b2.co.uk")).toEqual({ ok: true, host: "a1.b2.co.uk" });
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    [null, "empty"],
    ["https://brand.com", "not_a_name"],
    ["brand.com/path", "not_a_name"],
    ["brand.com:443", "not_a_name"],
    ["user@brand.com", "not_a_name"],
    ["brand com", "not_a_name"],
    ["singlelabel", "not_a_name"],
    ["-bad.com", "not_a_name"],
    ["bad-.com", "not_a_name"],
    ["a..b.com", "not_a_name"],
    ["x_y.com", "not_a_name"],
    ["1.2.3.4", "address"],
    ["10.0.0.1", "address"],
    ["::1", "address"],
    ["[::1]", "address"],
    ["2001:db8::1", "address"],
    ["0x7f000001", "address"],
    ["localhost", "internal"],
    ["app.localhost", "internal"],
    ["printer.local", "internal"],
    ["db.internal", "internal"],
    ["brand-a.test", "internal"],
    ["x.example", "internal"],
    ["4.3.2.1.in-addr.arpa", "internal"],
    ["affiqube.com", "platform"],
    ["app.affiqube.com", "platform"],
    ["my-app.vercel.app", "platform"],
    [`${"a".repeat(64)}.com`, "not_a_name"],
    [`${"abcdefghi.".repeat(26)}com`, "too_long"],
  ])("refuses %j (%s)", (input, reason) => {
    expect(normaliseHost(input)).toEqual({ ok: false, reason });
    expect(HOST_MESSAGES[reason as keyof typeof HOST_MESSAGES]).toBeTruthy();
  });

  it("refuses the application's own admin hosts", () => {
    expect(normaliseHost("admin.brand-ops.com", ["admin.brand-ops.com"])).toEqual({ ok: false, reason: "platform" });
    expect(normaliseHost("brand-ops.com", ["admin.brand-ops.com"])).toEqual({ ok: true, host: "brand-ops.com" });
  });

  it("agrees with the database rule (host_is_valid in 0010) on the same names", () => {
    const migration = readFileSync(path.join(__dirname, "../../../supabase/migrations/0010_sites_and_domains.sql"), "utf8");
    for (const name of ["localhost", "local", "internal", "invalid", "test", "example", "arpa", "affiqube\\.com", "vercel\\.app"]) {
      expect(migration, name).toContain(name);
    }
  });
});

describe("the DNS verdict", () => {
  const records = (txt: string[], cname: string[] = [], addresses: string[] = []) => ({ txt, cname, addresses });

  it("verifies with this row's code and a pointer to the platform", () => {
    expect(evaluateDnsCheck(records([CODE], ["cname.vercel-dns.com."]), CODE, TARGETS)).toEqual({ ok: true, reason: null });
    expect(evaluateDnsCheck(records([CODE], [], ["76.76.21.21"]), CODE, TARGETS)).toEqual({ ok: true, reason: null });
    expect(evaluateDnsCheck(records(["other", ` ${CODE} `], ["CNAME.Vercel-DNS.com"]), CODE, TARGETS).ok).toBe(true);
  });

  it("names what is missing", () => {
    expect(evaluateDnsCheck(records([]), CODE, TARGETS)).toEqual({ ok: false, reason: "txt_missing" });
    expect(evaluateDnsCheck(records(["another-rows-code"]), CODE, TARGETS)).toEqual({ ok: false, reason: "txt_wrong" });
    expect(evaluateDnsCheck(records([CODE.toUpperCase()]), CODE, TARGETS)).toEqual({ ok: false, reason: "txt_wrong" });
    expect(evaluateDnsCheck(records([CODE], ["somewhere-else.com"], ["1.1.1.1"]), CODE, TARGETS)).toEqual({ ok: false, reason: "not_pointing" });
    expect(evaluateDnsCheck(records([CODE]), CODE, { cnames: [], addresses: [] })).toEqual({ ok: false, reason: "not_pointing" });
    expect(evaluateDnsCheck(records([""]), "", TARGETS)).toEqual({ ok: false, reason: "txt_wrong" });
  });

  it("has a message for every result", () => {
    for (const key of ["verified", "txt_missing", "txt_wrong", "not_pointing", "lookup_failed"] as const) {
      expect(CHECK_MESSAGES[key]("go.brand-a-test.com")).toMatch(/\S/);
    }
  });

  it("reads its targets from configuration", () => {
    expect(dnsTargets({ SITE_DNS_CNAME_TARGETS: "cname.vercel-dns.com., Other.Example.com", SITE_DNS_A_TARGETS: "76.76.21.21" })).toEqual({
      cnames: ["cname.vercel-dns.com", "other.example.com"],
      addresses: ["76.76.21.21"],
    });
    expect(dnsTargets({})).toEqual({ cnames: [], addresses: [] });
  });
});

describe("the lookups", () => {
  const asked: string[] = [];
  const resolver = (records: Parameters<typeof fakeResolver>[0]): DnsResolver => {
    const inner = fakeResolver(records);
    return {
      resolveTxt: (name) => (asked.push(`TXT ${name}`), inner.resolveTxt(name)),
      resolveCname: (name) => (asked.push(`CNAME ${name}`), inner.resolveCname(name)),
      resolve4: (name) => (asked.push(`A ${name}`), inner.resolve4(name)),
      resolve6: (name) => (asked.push(`AAAA ${name}`), inner.resolve6(name)),
    };
  };

  it("asks for the TXT record under _affiqube. and the host's own records, nothing else", async () => {
    asked.length = 0;
    const result = await checkDomain(
      "go.brand-a-test.com",
      CODE,
      resolver({ "_affiqube.go.brand-a-test.com": { txt: [CODE] }, "go.brand-a-test.com": { cname: ["cname.vercel-dns.com"] } }),
      TARGETS,
    );
    expect(result).toEqual({ ok: true, reason: null });
    expect(asked.sort()).toEqual(
      ["TXT _affiqube.go.brand-a-test.com", "CNAME go.brand-a-test.com", "A go.brand-a-test.com", "AAAA go.brand-a-test.com"].sort(),
    );
  });

  it("joins a TXT record sent in chunks", async () => {
    const chunked: DnsResolver = {
      resolveTxt: async () => [[CODE.slice(0, 10), CODE.slice(10)]],
      resolveCname: async () => [],
      resolve4: async () => ["76.76.21.21"],
      resolve6: async () => [],
    };
    expect(await checkDomain("brand-a-test.com", CODE, chunked, TARGETS)).toEqual({ ok: true, reason: null });
  });

  it("treats 'no such record' as empty, and any other failure as a failed lookup", async () => {
    expect(await checkDomain("brand-a-test.com", CODE, resolver({}), TARGETS)).toEqual({ ok: false, reason: "txt_missing" });
    const broken: DnsResolver = {
      resolveTxt: () => Promise.reject(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })),
      resolveCname: async () => [],
      resolve4: async () => [],
      resolve6: async () => [],
    };
    expect(await checkDomain("brand-a-test.com", CODE, broken, TARGETS)).toEqual({ ok: false, reason: "lookup_failed" });
  });
});

describe("the fake resolver is for the local test stack only (B19)", () => {
  it("is allowed only with the local stack's address", () => {
    expect(fakeResolverAllowed({ E2E_DNS_FAKE_FILE: "x.json", NEXT_PUBLIC_SUPABASE_URL: LOCAL_TEST_STACK })).toBe(true);
    expect(fakeResolverAllowed({ E2E_DNS_FAKE_FILE: "x.json", NEXT_PUBLIC_SUPABASE_URL: "https://ktucieqhbkqktomigrsz.supabase.co" })).toBe(false);
    expect(fakeResolverAllowed({ E2E_DNS_FAKE_FILE: "x.json", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })).toBe(false);
    expect(fakeResolverAllowed({ E2E_DNS_FAKE_FILE: "x.json" })).toBe(false);
    expect(fakeResolverAllowed({ NEXT_PUBLIC_SUPABASE_URL: LOCAL_TEST_STACK })).toBe(false);
  });

  it("refuses to start against any other address", () => {
    expect(() =>
      domainResolver({ E2E_DNS_FAKE_FILE: "x.json", NEXT_PUBLIC_SUPABASE_URL: "https://ktucieqhbkqktomigrsz.supabase.co" }),
    ).toThrow(/local test stack only/);
  });

  it("uses Node's resolver when no fake is asked for", () => {
    const real = domainResolver({ NEXT_PUBLIC_SUPABASE_URL: "https://ktucieqhbkqktomigrsz.supabase.co" });
    expect(typeof real.resolveTxt).toBe("function");
  });
});

describe("DNS lookups only: the domain code never contacts a host (addition 1)", () => {
  it("imports no network client and calls no fetch", () => {
    const dir = __dirname;
    const files = readdirSync(dir).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const name of files) {
      const text = readFileSync(path.join(dir, name), "utf8");
      expect(text, name).not.toMatch(/from\s+["'](node:)?(https?|net|tls|http2|dgram|undici|axios|node-fetch)["']/);
      expect(text, name).not.toMatch(/\bfetch\s*\(/);
      expect(text, name).not.toMatch(/\bXMLHttpRequest\b|\bWebSocket\b/);
    }
  });
});
