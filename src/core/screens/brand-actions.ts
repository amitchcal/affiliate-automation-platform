"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/core/supabase/server";
import { businessTypeLabel, isBusinessType } from "@/core/modules";

const overviewPath = (brandId: string) => `/brands/${brandId}`;

function back(brandId: string, kind: "notice" | "error", message: string): never {
  redirect(`${overviewPath(brandId)}?${kind}=${encodeURIComponent(message)}`);
}

/**
 * T-07: the business type switches the brand's modules on and off. The
 * database allows only the owner and operators to change it and writes each
 * change to the audit log. Data of a switched-off module is kept, not deleted.
 */
export async function saveBusinessType(formData: FormData) {
  const brandId = String(formData.get("brand_id"));
  const type = formData.get("business_type");
  if (!isBusinessType(type)) back(brandId, "error", "Choose Affiliate marketing, Dropshipping, or Both.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brands")
    .update({ business_type: type })
    .eq("id", brandId)
    .select("id");
  if (error) back(brandId, "error", `The business type was not saved: ${error.message}`);
  if (!data || data.length === 0) {
    back(brandId, "error", "The business type was not saved. Only the owner and operators can change it.");
  }

  revalidatePath(overviewPath(brandId), "layout");
  back(brandId, "notice", `Business type set to ${businessTypeLabel(type)}.`);
}

/** O-01 and O-07: the client's choice of niche and platforms. */
export async function saveChoices(formData: FormData) {
  const brandId = String(formData.get("brand_id"));
  const niche = String(formData.get("niche") ?? "").trim();
  const platforms = formData.getAll("platforms").map(String);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brands")
    .update({ niche: niche || null, platforms })
    .eq("id", brandId)
    .select("id");
  if (error) back(brandId, "error", `Choices were not saved: ${error.message}`);
  if (!data || data.length === 0) back(brandId, "error", "Choices were not saved. Your role may not allow it.");

  revalidatePath(overviewPath(brandId));
  back(brandId, "notice", "Choices saved.");
}

/** C-01, C-04: the business details. Affiliate sites use them to fill the standard pages. */
export async function saveDetails(formData: FormData) {
  const brandId = String(formData.get("brand_id"));
  const supabase = await createClient();
  const { data: brand } = await supabase.from("brands").select("profile").eq("id", brandId).maybeSingle();
  if (!brand) back(brandId, "error", "That brand was not found.");

  const profile = {
    ...((brand!.profile as Record<string, unknown>) ?? {}),
    operator: String(formData.get("operator") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    tagline: String(formData.get("tagline") ?? "").trim(),
  };
  const { data, error } = await supabase.from("brands").update({ profile }).eq("id", brandId).select("id");
  if (error) back(brandId, "error", `Details were not saved: ${error.message}`);
  if (!data || data.length === 0) back(brandId, "error", "Details were not saved. Your role may not allow it.");

  revalidatePath(overviewPath(brandId), "layout");
  back(brandId, "notice", "Business details saved.");
}
