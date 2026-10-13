import Link from "next/link";

/** The three working areas of a brand: its offers, its public site, and its results. */
export function BrandNav({ brandId, current }: { brandId: string; current: "offers" | "site" | "results" }) {
  return (
    <nav className="tabs" aria-label="Brand sections">
      <Link href={`/brands/${brandId}`} aria-current={current === "offers" ? "page" : undefined}>
        Offers
      </Link>
      <Link href={`/brands/${brandId}/site`} aria-current={current === "site" ? "page" : undefined}>
        Site and links
      </Link>
      <Link href={`/brands/${brandId}/results`} aria-current={current === "results" ? "page" : undefined}>
        Results
      </Link>
    </nav>
  );
}
