import Link from "next/link";

/** The two working areas of a brand: its offers, and its public site. */
export function BrandNav({ brandId, current }: { brandId: string; current: "offers" | "site" }) {
  return (
    <nav className="tabs" aria-label="Brand sections">
      <Link href={`/brands/${brandId}`} aria-current={current === "offers" ? "page" : undefined}>
        Offers
      </Link>
      <Link href={`/brands/${brandId}/site`} aria-current={current === "site" ? "page" : undefined}>
        Site and links
      </Link>
    </nav>
  );
}
