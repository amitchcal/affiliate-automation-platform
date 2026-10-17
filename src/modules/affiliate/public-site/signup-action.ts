"use server";

import { headers } from "next/headers";
import { createPublicClient } from "@/core/supabase/public";
import { signupOutcome, type SignupOutcome } from "@/modules/affiliate/site/launch";

/**
 * S-08: a visitor's sign-up. The database decides everything from the host the
 * visitor is on: which brand, whether sign-up works there, and the wording to
 * store. The form sends only the address, the tick, the page, the wording's
 * version it showed, and the honeypot.
 */
export async function signUp(_previous: SignupOutcome | null, formData: FormData): Promise<SignupOutcome> {
  // The host the visitor is on; the database works out the brand from it.
  const host = ((await headers()).get("host") ?? "").split(":")[0];
  const page = String(formData.get("page") ?? "").slice(0, 200);
  const version = Number.parseInt(String(formData.get("consent_version") ?? ""), 10);

  const { error } = await createPublicClient().rpc("subscribe", {
    p_host: host,
    p_email: String(formData.get("email") ?? ""),
    p_page: page,
    p_consented: formData.get("consented") === "yes",
    p_consent_version: Number.isFinite(version) ? version : null,
    p_honeypot: String(formData.get("website") ?? ""),
  });
  // The answer goes back to the form, which shows it in place: no redirect, so
  // the visitor stays on the brand's own site (a redirect from a server action
  // is rendered without the middleware's routing by host).
  return error ? signupOutcome(error.message) : "done";
}
