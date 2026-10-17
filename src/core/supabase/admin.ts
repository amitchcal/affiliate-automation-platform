import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Sending invitation and sign-in emails through Supabase Auth (T-03).
 *
 * The service role key is read only here, from SUPABASE_SERVICE_ROLE_KEY: a
 * server-only variable, never NEXT_PUBLIC_, never committed. It is used for one
 * thing, inviteUserByEmail, and only after the database has accepted the
 * request (create_invitation or resend_invitation). Nothing here logs an
 * address, a link, or a key.
 */

export type Delivery = "invite" | "sign_in_link";

function noSession(key: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Sends the email for an invitation the database has just created or allowed
 * to be sent again. Step 0 (D1): an account that is not yet confirmed gets the
 * invitation again; a confirmed account gets a sign-in link.
 * Returns whether Supabase accepted the email for sending.
 */
export async function sendInvitationEmail(email: string, delivery: Delivery): Promise<boolean> {
  if (delivery === "invite") {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) return false;
    const { error } = await noSession(serviceKey).auth.admin.inviteUserByEmail(email);
    return !error;
  }
  return (await sendSignInLink(email)) === "sent";
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
