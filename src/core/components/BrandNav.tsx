"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandTab, currentTab } from "@/core/modules";

/**
 * A brand's tabs: the overview, then one set per module the brand has (T-07).
 * The tabs are passed in, so core never needs to know which modules exist.
 */
export function BrandNav({ brandId, tabs }: { brandId: string; tabs: BrandTab[] }) {
  const base = `/brands/${brandId}`;
  const current = currentTab(usePathname(), base, tabs);
  return (
    <nav className="tabs" aria-label="Brand sections">
      {tabs.map((tab) => (
        <Link key={tab.path} href={`${base}${tab.path}`} aria-current={tab === current ? "page" : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
