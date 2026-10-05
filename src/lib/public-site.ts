import { headers } from "next/headers";
import { createPublicClient } from "@/lib/supabase/public";

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

export async function getBrand(host: string): Promise<PublicBrand | null> {
  const { data } = await createPublicClient().rpc("public_brand", { p_host: host });
  return (data as PublicBrand[] | null)?.[0] ?? null;
}

export async function getPages(host: string): Promise<PublicPageSummary[]> {
  const { data } = await createPublicClient().rpc("public_pages", { p_host: host });
  return (data as PublicPageSummary[] | null) ?? [];
}

export async function getPage(host: string, slug: string): Promise<PublicPage | null> {
  const { data } = await createPublicClient().rpc("public_page", { p_host: host, p_slug: slug });
  return (data as PublicPage[] | null)?.[0] ?? null;
}
