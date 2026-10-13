import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasModule, ModuleId, moduleRefusal } from "@/core/modules";

export interface BrandModuleAccess {
  allowed: boolean;
  /** Present when allowed is false: the sentence to show the user. */
  message: string;
}

/**
 * T-07: may this brand use this module? Screens and server actions call this
 * first. It is the interface's check; the database refuses the same writes
 * on its own (0005), so a bypassed screen still cannot change anything.
 */
export async function checkModule(
  supabase: SupabaseClient,
  brandId: string,
  module: ModuleId,
): Promise<BrandModuleAccess> {
  const { data: brand } = await supabase
    .from("brands")
    .select("name, business_type")
    .eq("id", brandId)
    .maybeSingle();
  if (!brand) return { allowed: false, message: "That brand was not found, or your account cannot see it." };
  if (hasModule(brand.business_type as string, module)) return { allowed: true, message: "" };
  return { allowed: false, message: moduleRefusal(brand.name as string, brand.business_type as string, module) };
}
