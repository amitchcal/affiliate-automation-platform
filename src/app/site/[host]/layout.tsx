import Link from "next/link";
import { notFound } from "next/navigation";
import { getBrand, getPages, siteBase } from "@/lib/public-site";
import "../site.css";

/** The public shell of a brand's site: its name, and links to the standard pages (S-01, S-04). */
export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ host: string }>;
}) {
  const host = decodeURIComponent((await params).host);
  const brand = await getBrand(host);
  if (!brand) notFound();

  const base = await siteBase(host);
  const standard = (await getPages(host)).filter((page) => page.kind === "standard");

  return (
    <div className="site">
      <header className="site-header">
        <div className="wrap">
          <Link href={base || "/"} className="name">
            {brand.name}
          </Link>
        </div>
      </header>
      <main>
        <div className="wrap">{children}</div>
      </main>
      <footer className="site-footer">
        <div className="wrap">
          {standard.length > 0 ? (
            <ul>
              {standard.map((page) => (
                <li key={page.slug}>
                  <Link href={`${base}/${page.slug}`}>{page.title}</Link>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="fine">
            {brand.name} earns a commission on purchases made through links on this site, at no extra cost to you.
            {brand.operator ? ` Operated by ${brand.operator}.` : ""}
          </p>
        </div>
      </footer>
    </div>
  );
}
