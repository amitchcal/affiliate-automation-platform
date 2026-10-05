"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkContent, describeProblems } from "@/lib/compliance";
import { BusinessDetails, fillTemplate, missingDetails, offerPageStarter, slugify } from "@/lib/site";

function back(path: string, kind: "notice" | "error", message: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);
}
const sitePath = (brandId: string) => `/brands/${brandId}/site`;
const pagePath = (brandId: string, pageId: string) => `/brands/${brandId}/pages/${pageId}`;

async function loadBrand(brandId: string) {
  const supabase = await createClient();
  const { data: brand } = await supabase
    .from("brands")
    .select("id, client_id, name, domain, profile")
    .eq("id", brandId)
    .maybeSingle();
  return { supabase, brand };
}

/** C-01, C-04: the particulars that fill the compliance templates. */
export async function saveDetails(formData: FormData) {
  const brandId = String(formData.get("brand_id"));
  const { supabase, brand } = await loadBrand(brandId);
  if (!brand) back(sitePath(brandId), "error", "That brand was not found.");

  const profile = {
    ...((brand!.profile as Record<string, unknown>) ?? {}),
    operator: String(formData.get("operator") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    tagline: String(formData.get("tagline") ?? "").trim(),
  };
  const { error } = await supabase.from("brands").update({ profile }).eq("id", brandId);
  if (error) back(sitePath(brandId), "error", `Details were not saved: ${error.message}`);

  revalidatePath(sitePath(brandId));
  back(sitePath(brandId), "notice", "Business details saved.");
}

/** C-04, S-04: copy each compliance template into the site as a draft page. */
export async function createStandardPages(formData: FormData) {
  const brandId = String(formData.get("brand_id"));
  const { supabase, brand } = await loadBrand(brandId);
  if (!brand) back(sitePath(brandId), "error", "That brand was not found.");

  const profile = (brand!.profile ?? {}) as BusinessDetails;
  const missing = missingDetails(profile);
  if (missing.length > 0) {
    back(sitePath(brandId), "error", `Add the ${missing.join(", ")} under Business details first.`);
  }

  const { data: templates, error: templateError } = await supabase
    .from("compliance_templates")
    .select("key, title, body")
    .order("sort_order");
  if (templateError || !templates) back(sitePath(brandId), "error", "The templates could not be loaded.");

  const { data: existing } = await supabase.from("site_pages").select("template_key").eq("brand_id", brandId);
  const have = new Set((existing ?? []).map((row) => row.template_key));

  const rows = templates!
    .filter((template) => !have.has(template.key))
    .map((template) => ({
      client_id: brand!.client_id,
      brand_id: brandId,
      kind: "standard",
      slug: template.key,
      title: template.title,
      template_key: template.key,
      draft_body: fillTemplate(template.body, { brand: brand!.name, domain: brand!.domain, ...profile }),
    }));
  if (rows.length === 0) back(sitePath(brandId), "notice", "The standard pages already exist.");

  const { error } = await supabase.from("site_pages").insert(rows);
  if (error) back(sitePath(brandId), "error", `The standard pages were not created: ${error.message}`);

  revalidatePath(sitePath(brandId));
  back(sitePath(brandId), "notice", `${rows.length} standard pages created as drafts. Review and publish each one.`);
}

/**
 * S-02, O-06: start an offer page and its site link. The page begins as a
 * draft with a standard structure; an agent will fill it in a later increment.
 */
export async function createOfferPage(formData: FormData) {
  const brandId = String(formData.get("brand_id"));
  const offerId = String(formData.get("offer_id"));
  const { supabase, brand } = await loadBrand(brandId);
  if (!brand) back(sitePath(brandId), "error", "That brand was not found.");

  const { data: offer } = await supabase
    .from("offers")
    .select("id, name, status, affiliate_link")
    .eq("id", offerId)
    .maybeSingle();
  if (!offer) back(sitePath(brandId), "error", "That offer was not found.");
  if (offer!.status !== "approved") back(sitePath(brandId), "error", "Approve the offer before creating its page.");

  const link = String(formData.get("affiliate_link") ?? "").trim() || (offer!.affiliate_link as string | null);
  if (!link || !/^https?:\/\//i.test(link)) {
    back(sitePath(brandId), "error", "Enter your affiliate link for this offer. It must start with https://");
  }
  if (link !== offer!.affiliate_link) {
    const { error } = await supabase.from("offers").update({ affiliate_link: link }).eq("id", offerId);
    if (error) back(sitePath(brandId), "error", `The affiliate link was not saved: ${error.message}`);
  }

  const slug = slugify(offer!.name as string) || `offer-${offerId.slice(0, 8)}`;

  const { data: existingLink } = await supabase
    .from("tracked_links")
    .select("id")
    .eq("offer_id", offerId)
    .eq("channel", "site")
    .maybeSingle();
  if (!existingLink) {
    const { error } = await supabase.from("tracked_links").insert({
      client_id: brand!.client_id,
      brand_id: brandId,
      offer_id: offerId,
      slug,
      destination: link,
      channel: "site",
    });
    if (error) back(sitePath(brandId), "error", `The site link was not created: ${error.message}`);
  }

  const { data: page, error: pageError } = await supabase
    .from("site_pages")
    .insert({
      client_id: brand!.client_id,
      brand_id: brandId,
      kind: "offer",
      slug,
      title: `${offer!.name}: Overview`,
      offer_id: offerId,
      draft_body: offerPageStarter(offer!.name as string),
    })
    .select("id")
    .single();
  if (pageError || !page) {
    const message = pageError?.message.includes("duplicate")
      ? "A page with this address already exists for this brand."
      : `The page was not created: ${pageError?.message}`;
    back(sitePath(brandId), "error", message);
  }

  revalidatePath(sitePath(brandId));
  redirect(pagePath(brandId, page!.id as string));
}

/** S-06: start an article. */
export async function createArticle(formData: FormData) {
  const brandId = String(formData.get("brand_id"));
  const title = String(formData.get("title") ?? "").trim();
  if (!title) back(sitePath(brandId), "error", "Enter the article's title.");
  const slug = slugify(title);
  if (!slug || slug === "go") back(sitePath(brandId), "error", "Choose a title with letters or numbers in it.");

  const { supabase, brand } = await loadBrand(brandId);
  if (!brand) back(sitePath(brandId), "error", "That brand was not found.");

  const { data: page, error } = await supabase
    .from("site_pages")
    .insert({ client_id: brand!.client_id, brand_id: brandId, kind: "article", slug, title })
    .select("id")
    .single();
  if (error || !page) {
    const message = error?.message.includes("duplicate")
      ? "A page with this address already exists. Choose a different title."
      : `The article was not created: ${error?.message}`;
    back(sitePath(brandId), "error", message);
  }
  redirect(pagePath(brandId, page!.id as string));
}

/** O-06: a tracked link for another channel, campaign, or creative. */
export async function createLink(formData: FormData) {
  const brandId = String(formData.get("brand_id"));
  const offerId = String(formData.get("offer_id"));
  const channel = slugify(String(formData.get("channel") ?? ""));
  const campaign = String(formData.get("campaign") ?? "").trim();
  const creative = String(formData.get("creative") ?? "").trim();
  if (!channel) back(sitePath(brandId), "error", "Choose a channel for the link.");

  const { supabase, brand } = await loadBrand(brandId);
  if (!brand) back(sitePath(brandId), "error", "That brand was not found.");
  const { data: offer } = await supabase.from("offers").select("name, affiliate_link").eq("id", offerId).maybeSingle();
  if (!offer?.affiliate_link) back(sitePath(brandId), "error", "This offer has no affiliate link yet. Create its page first.");

  const slug = [slugify(offer!.name as string), channel, slugify(campaign), slugify(creative)].filter(Boolean).join("-");
  const { error } = await supabase.from("tracked_links").insert({
    client_id: brand!.client_id,
    brand_id: brandId,
    offer_id: offerId,
    slug,
    destination: offer!.affiliate_link,
    channel,
    campaign: campaign || null,
    creative: creative || null,
  });
  if (error) {
    const message = error.message.includes("duplicate")
      ? "A link with the same channel, campaign, and creative already exists."
      : `The link was not created: ${error.message}`;
    back(sitePath(brandId), "error", message);
  }
  revalidatePath(sitePath(brandId));
  back(sitePath(brandId), "notice", "Link created.");
}

async function writeDraft(formData: FormData) {
  const brandId = String(formData.get("brand_id"));
  const pageId = String(formData.get("page_id"));
  const title = String(formData.get("title") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  const supabase = await createClient();
  if (!title) back(pagePath(brandId, pageId), "error", "Enter a title.");

  const { data, error } = await supabase
    .from("site_pages")
    .update({ title, summary, draft_body: body })
    .eq("id", pageId)
    .select("id, kind, offer_id");
  if (error) back(pagePath(brandId, pageId), "error", `The draft was not saved: ${error.message}`);
  if (!data || data.length === 0) back(pagePath(brandId, pageId), "error", "The draft was not saved. Your role may not allow it.");
  return { supabase, brandId, pageId, title, summary, body, page: data![0] };
}

/** S-03: saving a draft never changes what visitors see. */
export async function saveDraft(formData: FormData) {
  const { brandId, pageId } = await writeDraft(formData);
  revalidatePath(pagePath(brandId, pageId));
  back(pagePath(brandId, pageId), "notice", "Draft saved. Visitors still see the published version.");
}

/**
 * S-03, K-05: save, check the wording, then publish. The database adds its
 * own checks: an approved offer (O-05) and published standard pages (S-04).
 */
export async function publishPage(formData: FormData) {
  const { supabase, brandId, pageId, title, summary, body, page } = await writeDraft(formData);

  let bannedClaims: string[] = [];
  if (page.offer_id) {
    const { data: rules } = await supabase
      .from("offer_rules")
      .select("banned_claims")
      .eq("offer_id", page.offer_id)
      .maybeSingle();
    bannedClaims = (rules?.banned_claims as string[] | null) ?? [];
  }
  // Standard pages are the compliance text itself (they must be able to say
  // "unless we used a product ourselves"), so the wording check covers offer
  // pages and articles only.
  const check =
    page.kind === "standard" ? { pass: true, problems: [] } : checkContent(`${title}\n${summary}\n${body}`, bannedClaims);
  if (!check.pass) {
    back(pagePath(brandId, pageId), "error", `Not published. Change this wording first. ${describeProblems(check)}`);
  }

  const { error } = await supabase
    .from("site_pages")
    .update({ status: "published", published_title: title, published_summary: summary, published_body: body })
    .eq("id", pageId);
  if (error) {
    const message = error.message.includes("standard page")
      ? "Not published. Publish the four standard pages for this site first."
      : error.message.includes("not approved")
        ? "Not published. This page's offer is no longer approved."
        : error.message.includes("no content")
          ? "Not published. The page has no content yet."
          : `Not published: ${error.message}`;
    back(pagePath(brandId, pageId), "error", message);
  }

  revalidatePath(pagePath(brandId, pageId));
  revalidatePath(sitePath(brandId));
  back(pagePath(brandId, pageId), "notice", "Published.");
}

export async function unpublishPage(formData: FormData) {
  const brandId = String(formData.get("brand_id"));
  const pageId = String(formData.get("page_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("site_pages").update({ status: "draft" }).eq("id", pageId);
  if (error) back(pagePath(brandId, pageId), "error", `Not unpublished: ${error.message}`);
  revalidatePath(pagePath(brandId, pageId));
  revalidatePath(sitePath(brandId));
  back(pagePath(brandId, pageId), "notice", "Unpublished. Visitors can no longer see this page.");
}
