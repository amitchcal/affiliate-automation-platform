import { headers } from "next/headers";
import { createPublicClient } from "@/core/supabase/public";
import { createClient } from "@/core/supabase/server";

export interface PublicBrand {
  name: string;
  domain: string;
  tagline: string | null;
  operator: string | null;
  contact_email: string | null;
}

export interface PublicPageSummary {
  slug: string;
  kind: "standard" | "offer" | "article";
  title: string;
  summary: string | null;
}

export interface PublicPage extends PublicPageSummary {
  body: string;
  cta_link: string | null;
}

/** "" on a brand's own domain; "/site/<domain>" when previewed on the admin host. */
export async function siteBase(host: string): Promise<string> {
  const base = (await headers()).get("x-site-base");
  if (base === "root") return "";
  return base ?? `/site/${host}`;
}

/**
 * Live or preview (S-01, batch 2). On a brand's own domain the middleware marks
 * the request "root": visitors read through the public functions, which serve
 * only verified hosts of live sites. On the admin host (/site/<domain>) it is a
 * preview: the person's own session reads through the preview functions, which
 * need a member of the brand's client. The middleware always sets the header
 * itself, so a request cannot choose.
 */
export async function isPreview(): Promise<boolean> {
  return (await headers()).get("x-site-base") !== "root";
}

async function read(publicFn: string, previewFn: string, host: string, extra: Record<string, unknown> = {}) {
  if (await isPreview()) {
    return (await createClient()).rpc(previewFn, { p_domain: host, ...extra });
  }
  return createPublicClient().rpc(publicFn, { p_host: host, ...extra });
}

export async function getBrand(host: string): Promise<PublicBrand | null> {
  const { data } = await read("public_brand", "preview_brand", host);
  return (data as PublicBrand[] | null)?.[0] ?? null;
}

export async function getPages(host: string): Promise<PublicPageSummary[]> {
  const { data } = await read("public_pages", "preview_pages", host);
  return (data as PublicPageSummary[] | null) ?? [];
}

export async function getPage(host: string, slug: string): Promise<PublicPage | null> {
  const { data } = await read("public_page", "preview_page", host, { p_slug: slug });
  return (data as PublicPage[] | null)?.[0] ?? null;
}

export interface SignupWording {
  consent_version: number;
  consent_text: string;
}

/** The sign-up form's wording, for a live site where sign-up works; null otherwise (S-08). */
export async function getSignup(host: string): Promise<SignupWording | null> {
  if (await isPreview()) return null;
  const { data } = await createPublicClient().rpc("public_signup", { p_host: host });
  return (data as SignupWording[] | null)?.[0] ?? null;
}
