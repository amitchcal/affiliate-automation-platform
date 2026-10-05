import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { renderMarkdown } from "@/lib/markdown";
import { getBrand, getPage, siteBase } from "@/lib/public-site";

type Params = Promise<{ host: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { host, slug } = await params;
  const page = await getPage(decodeURIComponent(host), slug);
  return page ? { title: page.title, description: page.summary ?? undefined } : {};
}

export default async function SitePage({ params }: { params: Params }) {
  const { host: rawHost, slug } = await params;
  const host = decodeURIComponent(rawHost);
  const [brand, page, base] = await Promise.all([getBrand(host), getPage(host, slug), siteBase(host)]);
  if (!brand || !page) notFound();

  const ctaHref = page.cta_link ? `${base}/go/${page.cta_link}?from=${encodeURIComponent(page.slug)}` : undefined;
  const html = renderMarkdown(page.body, { ctaHref });

  return (
    <article>
      <h1>{page.title}</h1>
      {/* The disclosure is added by the template, so an offer page cannot be published without it. */}
      {page.kind === "offer" ? (
        <p className="disclosure">
          <strong>Disclosure:</strong> {brand.name} earns a commission if you buy through the links on this page, at
          no extra cost to you. {brand.name} is an independent affiliate; this is not the seller's official website.{" "}
          <Link href={`${base}/affiliate-disclosure`}>Read our full disclosure</Link>.
        </p>
      ) : null}
      {page.summary && page.kind !== "standard" ? <p className="standfirst">{page.summary}</p> : null}
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {page.kind === "article" ? (
        <p className="fine">
          Some pages on this site contain affiliate links.{" "}
          <Link href={`${base}/affiliate-disclosure`}>Read our disclosure</Link>. This article is general information,
          not professional advice.
        </p>
      ) : null}
    </article>
  );
}
