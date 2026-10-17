import type { SupabaseClient } from "@supabase/supabase-js";

interface FailedHost {
  brand_id: string;
  host: string;
  failed_since: string;
  check_reason: string | null;
}

const REASONS: Record<string, string> = {
  txt_missing: "the TXT record was not found",
  txt_wrong: "the TXT record has a different value",
  not_pointing: "the domain no longer points at Affiqube",
  lookup_failed: "the domain could not be looked up",
};

export function failedHostWarning(host: FailedHost): string {
  const date = new Date(host.failed_since).toLocaleDateString("en-US", { dateStyle: "long" });
  return `Domain check failed for ${host.host} on ${date}: ${REASONS[host.check_reason ?? ""] ?? "it did not pass"}. The site is still live. Fix the DNS records and press Check domain.`;
}

/** Verified hosts whose last check failed (batch 2, addition 4), for the given brands. */
export async function failedHosts(supabase: SupabaseClient, brandIds: string[]): Promise<FailedHost[]> {
  if (brandIds.length === 0) return [];
  const { data } = await supabase
    .from("brand_domains")
    .select("brand_id, host, failed_since, check_reason")
    .in("brand_id", brandIds)
    .not("failed_since", "is", null)
    .order("host");
  return (data ?? []) as FailedHost[];
}

/** The warning on a brand's screens. Shown to everyone who can see the brand. */
export async function DomainWarnings({ supabase, brandId }: { supabase: SupabaseClient; brandId: string }) {
  const hosts = await failedHosts(supabase, [brandId]);
  if (hosts.length === 0) return null;
  return (
    <>
      {hosts.map((host) => (
        <p key={host.host} className="error" role="alert" data-warning="domain-check">
          {failedHostWarning(host)}
        </p>
      ))}
    </>
  );
}
