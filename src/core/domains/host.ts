import { domainToASCII } from "node:url";

/**
 * Host names a brand may use (S-01, batch 2 addition 1). The same rules as
 * host_is_valid() in 0010, which is the barrier; this gives the plain reason.
 */

export type HostRefusal = "empty" | "not_a_name" | "address" | "internal" | "platform" | "too_long";

export const HOST_MESSAGES: Record<HostRefusal, string> = {
  empty: "Enter a domain name such as example.com or go.example.com.",
  not_a_name: "Enter a domain name such as example.com or go.example.com, without https://, a path, or a port.",
  address: "Enter a domain name, not an IP address.",
  internal: "That is an internal or reserved name. Enter a public domain name such as example.com.",
  platform: "Affiqube's own domains cannot be used for a brand.",
  too_long: "That domain name is too long.",
};

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const RESERVED = ["localhost", "local", "internal", "invalid", "test", "example", "arpa"];
const PLATFORM = ["affiqube.com", "vercel.app"];

const endsWithName = (host: string, name: string) => host === name || host.endsWith(`.${name}`);

/**
 * The host in lower-case ASCII (punycode for international names), or why it
 * cannot be used. Admin hosts (ADMIN_HOSTS) count as platform names.
 */
export function normaliseHost(
  input: unknown,
  adminHosts: string[] = [],
): { ok: true; host: string } | { ok: false; reason: HostRefusal } {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return { ok: false, reason: "empty" };
  if (/[/:?#@\s\\[\]]/.test(raw)) {
    // A scheme, path, port, user, or IPv6 address.
    return { ok: false, reason: raw.includes(":") && /^[0-9a-f:.[\]]+$/i.test(raw) ? "address" : "not_a_name" };
  }
  const host = domainToASCII(raw.replace(/\.$/, "")).toLowerCase();
  if (!host) return { ok: false, reason: "not_a_name" };
  if (host.length > 253) return { ok: false, reason: "too_long" };
  const labels = host.split(".");
  if (/^[0-9]+$/.test(labels[labels.length - 1]) || /^0x[0-9a-f]+$/i.test(host)) return { ok: false, reason: "address" };
  if (RESERVED.some((name) => endsWithName(host, name))) return { ok: false, reason: "internal" };
  if (labels.length < 2 || !labels.every((label) => LABEL.test(label))) return { ok: false, reason: "not_a_name" };
  if ([...PLATFORM, ...adminHosts.map((h) => h.trim().toLowerCase()).filter(Boolean)].some((name) => endsWithName(host, name))) {
    return { ok: false, reason: "platform" };
  }
  return { ok: true, host };
}
