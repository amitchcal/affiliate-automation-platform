"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordDomainCheck } from "@/core/supabase/admin";
import { createClient } from "@/core/supabase/server";
import { CHECK_MESSAGES, checkDomain, dnsTargets } from "./dns-check";
import { HOST_MESSAGES, normaliseHost } from "./host";
import { domainResolver } from "./resolver";

/**
 * A brand's hosts (S-01, core): add, remove, check. The database decides who
 * may (row-level security, can_check_domain); the DNS lookup happens only after
 * it has said yes, and only the server records the result, with the service role.
 */

const NOT_ALLOWED = "Only the owner and operators can add or check domains.";

/** Back to the screen the form came from: a brand's own page, nothing else. */
function back(returnTo: FormDataEntryValue | null, kind: "notice" | "error", message: string): never {
  const path = typeof returnTo === "string" && /^\/brands\/[0-9a-f-]{36}(\/[a-z]+)?$/.test(returnTo) ? returnTo : "/clients";
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);
}

function adminHosts(): string[] {
  return (process.env.ADMIN_HOSTS ?? "localhost,127.0.0.1").split(",");
}

export async function addDomain(formData: FormData) {
  const returnTo = formData.get("return_to");
  const brandId = String(formData.get("brand_id") ?? "");
  const purpose = formData.get("purpose") === "links" ? "links" : "site";
  const checked = normaliseHost(formData.get("host"), adminHosts());
  if (!checked.ok) back(returnTo, "error", HOST_MESSAGES[checked.reason]);

  const supabase = await createClient();
  const { data: brand } = await supabase.from("brands").select("id, client_id").eq("id", brandId).maybeSingle();
  if (!brand) back(returnTo, "error", NOT_ALLOWED);
  const { error } = await supabase
    .from("brand_domains")
    .insert({ client_id: brand!.client_id, brand_id: brandId, host: checked.host, purpose });
  if (error) {
    const message =
      error.message === "domain_taken"
        ? `${checked.host} is already used by another brand.`
        : error.code === "23505"
          ? `${checked.host} is already on this brand.`
          : error.code === "42501"
            ? NOT_ALLOWED
            : "The domain was not added. Check the name and try again.";
    back(returnTo, "error", message);
  }
  revalidatePath(String(returnTo ?? ""));
  back(returnTo, "notice", `${checked.host} added. Add the DNS records shown, then press Check domain.`);
}

export async function removeDomain(formData: FormData) {
  const returnTo = formData.get("return_to");
  const id = String(formData.get("domain_id") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.from("brand_domains").delete().eq("id", id).select("host");
  if (error || !data || data.length === 0) back(returnTo, "error", NOT_ALLOWED);
  back(returnTo, "notice", `${data![0].host} removed.`);
}

export async function checkDomainNow(formData: FormData) {
  const returnTo = formData.get("return_to");
  const id = String(formData.get("domain_id") ?? "");
  const supabase = await createClient();

  // The database first: may this person check this host? Nothing is looked up otherwise.
  const { data: allowed } = await supabase.rpc("can_check_domain", { p_domain: id });
  if (allowed !== true) back(returnTo, "error", NOT_ALLOWED);
  const [{ data: row }, { data: auth }] = await Promise.all([
    supabase.from("brand_domains").select("host, verification_code").eq("id", id).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  if (!row || !auth.user) back(returnTo, "error", NOT_ALLOWED);

  const result = await checkDomain(row!.host, row!.verification_code, domainResolver(), dnsTargets());
  const { error } = await recordDomainCheck(id, auth.user!.id, result.ok, result.reason);
  if (error) {
    back(returnTo, "error", error === "domain_taken" ? `${row!.host} is already used by another brand.` : CHECK_MESSAGES.lookup_failed(row!.host));
  }
  revalidatePath(String(returnTo ?? ""));
  if (result.ok) back(returnTo, "notice", CHECK_MESSAGES.verified(row!.host));
  back(returnTo, "error", CHECK_MESSAGES[result.reason!](row!.host));
}
