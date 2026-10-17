import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for the browser, sharing the signed-in session cookie with
 * the server. Used only where a secret must not pass through our server: the
 * authenticator setup and the sign-in code step (T-05). It carries the anon key
 * and the user's session, so row-level security applies as everywhere else.
 */
export function createBrowserSupabase() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
