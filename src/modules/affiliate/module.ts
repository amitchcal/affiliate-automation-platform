import type { ModuleDefinition } from "@/core/modules";

/** How the affiliate module plugs into a brand's screens (T-07). */
export const affiliateModule: ModuleDefinition = {
  id: "affiliate",
  label: "Affiliate marketing",
  summary:
    "Scored offers with each seller's rules, the brand's own site with its standard pages, tracked links, and network sales.",
  tabs: [
    { label: "Offers", path: "/offers" },
    { label: "Site and links", path: "/site", alsoMatches: ["/pages"] },
    { label: "Results", path: "/results" },
  ],
};
