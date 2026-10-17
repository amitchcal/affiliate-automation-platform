import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Where a person goes after signing in (T-03): to their open invitations
 * first, if they have any, otherwise to the clients list.
 */
export async function landingAfterSignIn(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase.rpc("my_open_invitations");
  return Array.isArray(data) && data.length > 0 ? "/invitations" : "/clients";
}
