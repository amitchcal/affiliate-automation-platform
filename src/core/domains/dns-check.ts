/**
 * Proving a brand's host (S-01, batch 2). DNS lookups only: nothing here ever
 * connects to the host itself (no HTTP, no fetch, no redirects), so a host
 * entered by a person cannot make the server call it (addition 1).
 *
 * A host is proven when both hold:
 *   - a TXT record at _affiqube.<host> equals this host row's own code;
 *   - the host points at the platform: a CNAME to a configured target, or an
 *     A or AAAA record with a configured address.
 */

export type CheckReason = "txt_missing" | "txt_wrong" | "not_pointing" | "lookup_failed";

export interface DnsRecords {
  txt: string[];
  cname: string[];
  addresses: string[];
}

export interface DnsTargets {
  cnames: string[];
  addresses: string[];
}

/** The lookups the check needs, as Node's resolver offers them. */
export interface DnsResolver {
  resolveTxt(name: string): Promise<string[][]>;
  resolveCname(name: string): Promise<string[]>;
  resolve4(name: string): Promise<string[]>;
  resolve6(name: string): Promise<string[]>;
}

export const CHECK_MESSAGES: Record<CheckReason | "verified", (host: string) => string> = {
  verified: (host) => `${host} is verified.`,
  txt_missing: (host) =>
    `The TXT record _affiqube.${host} was not found. DNS changes can take up to a few hours; try again later.`,
  txt_wrong: (host) => `The TXT record _affiqube.${host} has a different value. It must be exactly the code shown.`,
  not_pointing: (host) => `${host} does not point at Affiqube yet. Add the CNAME (or A) record shown.`,
  lookup_failed: () => "The domain could not be looked up just now. Try again in a few minutes.",
};

const clean = (name: string) => name.trim().toLowerCase().replace(/\.$/, "");

/** Targets from configuration: SITE_DNS_CNAME_TARGETS and SITE_DNS_A_TARGETS, comma separated. */
export function dnsTargets(env: Record<string, string | undefined> = process.env): DnsTargets {
  const list = (value: string | undefined) => (value ?? "").split(",").map(clean).filter(Boolean);
  return { cnames: list(env.SITE_DNS_CNAME_TARGETS), addresses: list(env.SITE_DNS_A_TARGETS) };
}

/** The verdict on looked-up records. Pure, so every case is unit tested. */
export function evaluateDnsCheck(records: DnsRecords, code: string, targets: DnsTargets): { ok: boolean; reason: CheckReason | null } {
  const values = records.txt.map((value) => value.trim());
  if (values.length === 0) return { ok: false, reason: "txt_missing" };
  if (!code || !values.includes(code)) return { ok: false, reason: "txt_wrong" };
  const pointsHere =
    records.cname.map(clean).some((name) => targets.cnames.includes(name)) ||
    records.addresses.map(clean).some((address) => targets.addresses.includes(address));
  return pointsHere ? { ok: true, reason: null } : { ok: false, reason: "not_pointing" };
}

/** "No such record" answers, which mean an empty list rather than a failed lookup. */
const NO_RECORD = new Set(["ENODATA", "ENOTFOUND", "NOTFOUND", "ENOTIMP"]);

async function lookup<T>(run: () => Promise<T[]>): Promise<T[]> {
  try {
    return await run();
  } catch (error) {
    if (NO_RECORD.has((error as { code?: string }).code ?? "")) return [];
    throw error;
  }
}

/** Looks up the host's records and gives the verdict. Never contacts the host. */
export async function checkDomain(
  host: string,
  code: string,
  resolver: DnsResolver,
  targets: DnsTargets,
): Promise<{ ok: boolean; reason: CheckReason | null }> {
  try {
    const [txt, cname, a, aaaa] = await Promise.all([
      lookup(() => resolver.resolveTxt(`_affiqube.${host}`)),
      lookup(() => resolver.resolveCname(host)),
      lookup(() => resolver.resolve4(host)),
      lookup(() => resolver.resolve6(host)),
    ]);
    // A TXT record may arrive in several chunks; they form one value.
    return evaluateDnsCheck({ txt: txt.map((chunks) => chunks.join("")), cname, addresses: [...a, ...aaaa] }, code, targets);
  } catch {
    return { ok: false, reason: "lookup_failed" };
  }
}
