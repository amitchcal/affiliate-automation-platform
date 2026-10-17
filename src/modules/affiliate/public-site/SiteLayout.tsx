import Link from "next/link";
import { notFound } from "next/navigation";
import { getBrand, getPages, getSignup, isPreview, siteBase } from "@/modules/affiliate/site/public-site";
import { SignupForm } from "./SignupForm";
import "./site.css";

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

  const [base, pages, signup, preview] = await Promise.all([siteBase(host), getPages(host), getSignup(host), isPreview()]);
  const standard = pages.filter((page) => page.kind === "standard");

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
          {signup ? (
            <SignupForm
              brandName={brand.name}
              consentText={signup.consent_text}
              consentVersion={signup.consent_version}
              privacyHref={`${base}/privacy`}
            />
          ) : preview ? (
            <p className="fine">Preview. The email sign-up form, when it is on, shows on the live site only.</p>
          ) : null}
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
