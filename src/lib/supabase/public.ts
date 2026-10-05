import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client for the public brand sites. It carries no session, so it
 * can do only what a visitor may: call the public_* functions, which return
 * published content, and record_click (T-02, S-07).
 */
export function createPublicClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
