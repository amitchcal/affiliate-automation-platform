import type { Metadata } from "next";
import Link from "next/link";
import { getBrand, getPages, siteBase } from "@/lib/public-site";

export async function generateMetadata({ params }: { params: Promise<{ host: string }> }): Promise<Metadata> {
  const brand = await getBrand(decodeURIComponent((await params).host));
  return brand ? { title: brand.name, description: brand.tagline ?? undefined } : {};
}

/** S-05: the home page lists the brand's published offer pages and articles. */
export default async function SiteHome({ params }: { params: Promise<{ host: string }> }) {
  const host = decodeURIComponent((await params).host);
  const [brand, pages, base] = await Promise.all([getBrand(host), getPages(host), siteBase(host)]);
  if (!brand) return null;

  const offers = pages.filter((page) => page.kind === "offer");
  const articles = pages.filter((page) => page.kind === "article");
  const hasDisclosure = pages.some((page) => page.slug === "affiliate-disclosure");

  return (
    <>
      <h1>{brand.tagline || brand.name}</h1>
      <p className="disclosure">
        {brand.name} earns a commission on purchases made through links on this site, at no extra cost to you.{" "}
        {hasDisclosure ? <Link href={`${base}/affiliate-disclosure`}>Read our disclosure</Link> : null}
      </p>

      {offers.length > 0 ? (
        <>
          <h2>Product overviews</h2>
          <ul className="listing">
            {offers.map((page) => (
              <li key={page.slug}>
                <h3>
                  <Link href={`${base}/${page.slug}`}>{page.title}</Link>
                </h3>
                {page.summary ? <p>{page.summary}</p> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {articles.length > 0 ? (
        <>
          <h2>Guides</h2>
          <ul className="listing">
            {articles.map((page) => (
              <li key={page.slug}>
                <h3>
                  <Link href={`${base}/${page.slug}`}>{page.title}</Link>
                </h3>
                {page.summary ? <p>{page.summary}</p> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {offers.length === 0 && articles.length === 0 ? <p>This site is being prepared. Please check back soon.</p> : null}
    </>
  );
}
