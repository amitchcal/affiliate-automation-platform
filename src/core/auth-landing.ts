import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** The setup screen, in the mode that says two-factor sign-in is required (T05-4). */
export const SETUP_REQUIRED = "/account/security?required=1";

/**
 * Whether this session must turn two-factor sign-in on before anything else:
 * a password-only session of a role that requires it, with no authenticator.
 * The middleware asks this on page loads; a form's server action renders its
 * next page inside the same request, so actions ask it themselves.
 */
export async function mustSetUpTwoFactor(supabase: SupabaseClient): Promise<boolean> {
  const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (level?.currentLevel !== "aal1" || level.nextLevel === "aal2") return false;
  const { data: required } = await supabase.rpc("mfa_required");
  return required === true;
}

/**
 * Where a person goes after signing in: to the code step if two-factor sign-in
 * is on and only the password (or an email link) has been used (T-05); then to
 * their open invitations, if any (T-03); then to the setup screen if their role
 * requires two-factor sign-in and it is not on yet; otherwise to the clients list.
 */
export async function landingAfterSignIn(supabase: SupabaseClient): Promise<string> {
  const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (level?.nextLevel === "aal2" && level.currentLevel !== "aal2") return "/login/two-factor";
  const { data } = await supabase.rpc("my_open_invitations");
  if (Array.isArray(data) && data.length > 0) return "/invitations";
  return (await mustSetUpTwoFactor(supabase)) ? SETUP_REQUIRED : "/clients";
}
