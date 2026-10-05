/** Small helpers shared by the site module. */

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export interface BusinessDetails {
  operator?: string;
  address?: string;
  email?: string;
  tagline?: string;
}

/** The details every standard page needs before it can be created (C-04). */
export function missingDetails(profile: BusinessDetails): string[] {
  const missing: string[] = [];
  if (!profile.operator?.trim()) missing.push("operator name");
  if (!profile.address?.trim()) missing.push("address");
  if (!profile.email?.trim()) missing.push("contact email");
  return missing;
}

/** Fills a compliance template with the brand's particulars (C-04). */
export function fillTemplate(
  body: string,
  values: { brand: string; domain: string } & BusinessDetails,
): string {
  const map: Record<string, string> = {
    brand: values.brand,
    domain: values.domain,
    operator: values.operator ?? "",
    address: values.address ?? "",
    email: values.email ?? "",
  };
  return body.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => (key in map ? map[key] : whole));
}

/** A starting structure for an offer page. The writer fills each section. */
export function offerPageStarter(offerName: string): string {
  return [
    `${offerName} in one or two plain sentences: what it is and who it is for.`,
    "",
    "[[cta:See it on the official site]]",
    "",
    "## What it is",
    "",
    "Describe the product using facts the seller publishes.",
    "",
    "## What you get",
    "",
    "- First item",
    "- Second item",
    "",
    "## Who it suits",
    "",
    "- First kind of person",
    "",
    "## Who should look elsewhere",
    "",
    "- First kind of person",
    "",
    "## How we prepared this overview",
    "",
    "This page summarizes information published by the product's creator. It is an overview, not a hands-on review: we have not used the product ourselves. Please confirm the details on the official page before you buy.",
    "",
    "[[cta:See it on the official site]]",
  ].join("\n");
}
