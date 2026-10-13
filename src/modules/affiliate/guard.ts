import "server-only";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkModule } from "@/core/brand-access";

/**
 * T-07: every affiliate server action calls this first, so an action posted
 * directly, without its screen, is still refused for a brand without the
 * affiliate module. The refusal is shown on the brand's Overview.
 */
export async function requireAffiliate(supabase: SupabaseClient, brandId: string): Promise<void> {
  const access = await checkModule(supabase, brandId, "affiliate");
  if (!access.allowed) redirect(`/brands/${brandId}?error=${encodeURIComponent(access.message)}`);
}
