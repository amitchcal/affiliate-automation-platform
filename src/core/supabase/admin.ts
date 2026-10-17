import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Sending invitation and sign-in emails through Supabase Auth (T-03).
 *
 * The service role key is read only here, from SUPABASE_SERVICE_ROLE_KEY: a
 * server-only variable, never NEXT_PUBLIC_, never committed. It is used for two
 * things, each only after the database has accepted the signed-in person's
 * request: inviteUserByEmail (after create_invitation or resend_invitation,
 * T-03), and recording a domain check's result (after can_check_domain, S-01).
 * Nothing here logs an address, a link, or a key.
 */

function noSession(key: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Sends the email for an invitation the database has just created or allowed
 * to be sent again. Supabase decides which email fits (step 0, U1): an
 * invitation for a new or not-yet-confirmed account; for a confirmed account
 * it refuses with "email_exists", and a sign-in link is sent instead. The
 * caller cannot tell which was sent, so neither can the browser.
 * Returns whether Supabase accepted an email for sending.
 */
export async function sendInvitationEmail(email: string): Promise<boolean> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return false;
  const { error } = await noSession(serviceKey).auth.admin.inviteUserByEmail(email);
  if (!error) return true;
  if (error.code === "email_exists") return (await sendSignInLink(email)) === "sent";
  return false;
}

/**
 * A single-use sign-in link for an existing, confirmed account. Never creates
 * an account. With public sign-up off, Supabase refuses unknown and unconfirmed
 * addresses (step 0, U10); callers show the same message either way. Only a
 * rate limit is told apart, because it says nothing about the address.
 */
export async function sendSignInLink(email: string): Promise<"sent" | "not_sent" | "rate_limited"> {
  const { error } = await noSession(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!).auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (!error) return "sent";
  return error.status === 429 ? "rate_limited" : "not_sent";
}

/**
 * S-01: records the server's DNS check of a host. Only the service role may
 * (record_domain_check in 0010); the caller has already asked the database,
 * as the signed-in person, whether that person may check this host.
 */
export async function recordDomainCheck(
  domainId: string,
  actorId: string,
  ok: boolean,
  reason: string | null,
): Promise<{ error: string | null }> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return { error: "not_configured" };
  const { error } = await noSession(serviceKey).rpc("record_domain_check", {
    p_domain: domainId,
    p_actor: actorId,
    p_ok: ok,
    p_reason: reason,
  });
  return { error: error ? error.message : null };
}
