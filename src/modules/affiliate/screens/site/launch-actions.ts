"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/core/supabase/server";
import { requireAffiliate } from "@/modules/affiliate/guard";
import { launchRefusalMessage } from "@/modules/affiliate/site/launch";
import { createStandardPages } from "./actions";

/**
 * Going live and email sign-up (S-01, S-08). Every rule is the database's:
 * these actions call its functions and word the answer.
 */

const sitePath = (brandId: string) => `/brands/${brandId}/site`;

function back(brandId: string, kind: "notice" | "error", message: string): never {
  redirect(`${sitePath(brandId)}?${kind}=${encodeURIComponent(message)}`);
}

async function call(formData: FormData, fn: string, args: (brandId: string) => Record<string, unknown>) {
  const brandId = String(formData.get("brand_id") ?? "");
  const supabase = await createClient();
  await requireAffiliate(supabase, brandId);
  const { error } = await supabase.rpc(fn, args(brandId));
  revalidatePath(sitePath(brandId));
  return { brandId, supabase, error };
}

/** S01-1: the site record, then the four standard pages from the templates. */
export async function setUpSite(formData: FormData) {
  const { brandId, error } = await call(formData, "set_up_site", (id) => ({ p_brand: id }));
  if (error) back(brandId, "error", launchRefusalMessage(error.message));
  await createStandardPages(formData);
}

export async function goLive(formData: FormData) {
  const { brandId, error } = await call(formData, "go_live", (id) => ({ p_brand: id }));
  if (error) back(brandId, "error", launchRefusalMessage(error.message));
  back(brandId, "notice", "The site is live. Visitors can now see it on its verified domain.");
}

export async function takeOffline(formData: FormData) {
  const { brandId, error } = await call(formData, "take_offline", (id) => ({ p_brand: id }));
  if (error) back(brandId, "error", launchRefusalMessage(error.message));
  back(brandId, "notice", "The site is offline. Visitors see \"This site is not available.\"");
}

export async function setSignup(formData: FormData) {
  const on = formData.get("on") === "true";
  const { brandId, error } = await call(formData, "set_signup", (id) => ({ p_brand: id, p_on: on }));
  if (error) back(brandId, "error", launchRefusalMessage(error.message));
  back(brandId, "notice", on ? "Email sign-up is on. The form shows on the home page and in the footer." : "Email sign-up is off.");
}

/** S08-7: a request to be forgotten. The row goes; the audit keeps no address. */
export async function deleteSubscriber(formData: FormData) {
  const brandId = String(formData.get("brand_id") ?? "");
  const id = String(formData.get("subscriber_id") ?? "");
  const supabase = await createClient();
  await requireAffiliate(supabase, brandId);
  const { data, error } = await supabase.from("subscribers").delete().eq("id", id).eq("brand_id", brandId).select("id");
  revalidatePath(sitePath(brandId));
  if (error || !data || data.length === 0) back(brandId, "error", "Only the owner and operators can delete a subscriber.");
  back(brandId, "notice", "Subscriber deleted. Their email address is no longer stored.");
}

/** Addition 5: the current template, filled with the brand's details, into the page's draft. */
export async function updateFromTemplate(formData: FormData) {
  const brandId = String(formData.get("brand_id") ?? "");
  const pageId = String(formData.get("page_id") ?? "");
  const supabase = await createClient();
  await requireAffiliate(supabase, brandId);
  const { error } = await supabase.rpc("update_page_from_template", { p_page: pageId });
  if (error) back(brandId, "error", launchRefusalMessage(error.message));
  revalidatePath(sitePath(brandId));
  redirect(
    `/brands/${brandId}/pages/${pageId}?notice=${encodeURIComponent(
      "The draft now has the current template wording. Review it, then publish it. Visitors still see the published version.",
    )}`,
  );
}
