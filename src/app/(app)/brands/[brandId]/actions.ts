"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadScoringConfig } from "@/lib/scoring-config";
import { formLevel, formNumber, toOfferInput } from "@/lib/offers";
import { scoreOffer } from "@/scoring/score";

function back(brandId: string, kind: "notice" | "error", message: string): never {
  redirect(`/brands/${brandId}?${kind}=${encodeURIComponent(message)}`);
}

/** O-01 and O-07: the client's choice of niche and platforms. */
export async function saveChoices(formData: FormData) {
  const brandId = String(formData.get("brand_id"));
  const niche = String(formData.get("niche") ?? "").trim();
  const platforms = formData.getAll("platforms").map(String);

  const supabase = await createClient();
  const { error } = await supabase
    .from("brands")
    .update({ niche: niche || null, platforms })
    .eq("id", brandId);
  if (error) back(brandId, "error", `Choices were not saved: ${error.message}`);

  revalidatePath(`/brands/${brandId}`);
  back(brandId, "notice", "Choices saved.");
}

/**
 * O-02, O-03, O-08: record an offer with whatever figures are known, score it,
 * and store the result. The same path serves suggested and client-supplied offers.
 */
export async function addOffer(formData: FormData) {
  const brandId = String(formData.get("brand_id"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) back(brandId, "error", "Enter the offer's name.");

  const supabase = await createClient();

  // The client is read from the brand, never taken from the form.
  const { data: brand } = await supabase.from("brands").select("id, client_id").eq("id", brandId).maybeSingle();
  if (!brand) back(brandId, "error", "That brand was not found.");
  const clientId = brand!.client_id as string;

  const { data: offer, error: offerError } = await supabase
    .from("offers")
    .insert({
      client_id: clientId,
      brand_id: brandId,
      name,
      network: String(formData.get("network") ?? "clickbank"),
      seller_ref: String(formData.get("seller_ref") ?? "").trim() || null,
      affiliate_link: String(formData.get("affiliate_link") ?? "").trim() || null,
      sales_page_url: String(formData.get("sales_page_url") ?? "").trim() || null,
      source: formData.get("source") === "client_supplied" ? "client_supplied" : "suggested",
    })
    .select("id")
    .single();
  if (offerError || !offer) back(brandId, "error", `The offer was not saved: ${offerError?.message}`);
  const offerId = offer!.id as string;

  const recurringField = String(formData.get("recurring") ?? "");
  const metrics = {
    captured_on: new Date().toISOString().slice(0, 10),
    payout: formNumber(formData.get("payout")) ?? null,
    conversion_rate: formNumber(formData.get("conversion_rate")) ?? null,
    epc: formNumber(formData.get("epc")) ?? null,
    gravity: formNumber(formData.get("gravity")) ?? null,
    refund_rate: formNumber(formData.get("refund_rate")) ?? null,
    recurring: recurringField === "yes" ? true : recurringField === "no" ? false : null,
  };
  const { error: metricsError } = await supabase
    .from("offer_metrics")
    .insert({ offer_id: offerId, client_id: clientId, ...metrics });
  if (metricsError) back(brandId, "error", `The figures were not saved: ${metricsError.message}`);

  const complianceRisk = formLevel(formData.get("compliance_risk"));
  const sellerRestrictions = formLevel(formData.get("seller_restrictions"));
  const termsUrl = String(formData.get("terms_url") ?? "").trim() || null;
  let rules = null;
  if (complianceRisk || sellerRestrictions || termsUrl) {
    rules = {
      compliance_risk: complianceRisk ?? null,
      seller_restrictions: sellerRestrictions ?? null,
      terms_url: termsUrl,
      approved: false,
    };
    const { error: rulesError } = await supabase
      .from("offer_rules")
      .insert({ offer_id: offerId, client_id: clientId, ...rules });
    if (rulesError) back(brandId, "error", `The seller's rules were not saved: ${rulesError.message}`);
  }

  const config = await loadScoringConfig(supabase, clientId, brandId);
  const result = scoreOffer(toOfferInput(name, metrics, rules), config);
  const { error: scoreError } = await supabase
    .from("offers")
    .update({
      status: "scored",
      score: result.score,
      channel: result.channel,
      break_even_cpc: result.breakEvenCostPerClick ?? null,
      explanation: result.explanation,
      provisional: result.provisional,
    })
    .eq("id", offerId);
  if (scoreError) back(brandId, "error", `The score was not saved: ${scoreError.message}`);

  revalidatePath(`/brands/${brandId}`);
  back(brandId, "notice", `${name} scored ${result.score} out of 100.`);
}

/** C-03: the rules record must be approved before the offer can be. */
export async function approveRules(formData: FormData) {
  const brandId = String(formData.get("brand_id"));
  const offerId = String(formData.get("offer_id"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("offer_rules")
    .update({ approved: true, approved_by: user?.id ?? null, approved_at: new Date().toISOString() })
    .eq("offer_id", offerId)
    .select("offer_id");
  if (error) back(brandId, "error", `The rules were not approved: ${error.message}`);
  if (!data || data.length === 0) {
    back(brandId, "error", "The rules were not approved. Your role may not allow it, or no rules are recorded.");
  }
  revalidatePath(`/brands/${brandId}`);
  back(brandId, "notice", "Seller's rules approved.");
}

/** O-05: nothing is promoted without a decision. The database enforces C-03. */
export async function approveOffer(formData: FormData) {
  const brandId = String(formData.get("brand_id"));
  const offerId = String(formData.get("offer_id"));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("offers")
    .update({ status: "approved" })
    .eq("id", offerId)
    .select("id");
  if (error) {
    const message = error.message.includes("no approved rules record")
      ? "Approve the seller's rules for this offer first."
      : `The offer was not approved: ${error.message}`;
    back(brandId, "error", message);
  }
  if (!data || data.length === 0) back(brandId, "error", "The offer was not approved. Your role may not allow it.");
  revalidatePath(`/brands/${brandId}`);
  back(brandId, "notice", "Offer approved.");
}
