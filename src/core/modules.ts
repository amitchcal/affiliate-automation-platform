/**
 * Module entitlement (T-07). A brand's business type decides which modules it
 * has. Core defines the shape of a module here; each module describes itself
 * in src/modules/<name>/module.ts, and only src/app puts the list together, so
 * core never imports a module.
 *
 * The database enforces the same rule (brand_has_module in 0005); this file
 * decides what the interface shows and gives refusals their wording.
 */

export type BusinessType = "affiliate" | "dropshipping" | "both";
export type ModuleId = "affiliate" | "dropshipping";

export const BUSINESS_TYPES: { value: BusinessType; label: string; description: string }[] = [
  {
    value: "affiliate",
    label: "Affiliate marketing",
    description: "Promote other companies' products and earn a commission on each sale.",
  },
  {
    value: "dropshipping",
    label: "Dropshipping",
    description: "Sell products from your own store, shipped to customers by a supplier.",
  },
  {
    value: "both",
    label: "Both",
    description: "Run affiliate marketing and a dropshipping store under one brand.",
  },
];

const MODULE_LABELS: Record<ModuleId, string> = {
  affiliate: "affiliate marketing",
  dropshipping: "dropshipping",
};

export function isBusinessType(value: unknown): value is BusinessType {
  return BUSINESS_TYPES.some((type) => type.value === value);
}

export function businessTypeLabel(type: string | null | undefined): string {
  return BUSINESS_TYPES.find((entry) => entry.value === type)?.label ?? "Not set";
}

/** The modules a business type switches on. An unknown type switches on none. */
export function modulesFor(type: string | null | undefined): ModuleId[] {
  switch (type) {
    case "affiliate":
      return ["affiliate"];
    case "dropshipping":
      return ["dropshipping"];
    case "both":
      return ["affiliate", "dropshipping"];
    default:
      return [];
  }
}

export function hasModule(type: string | null | undefined, module: ModuleId): boolean {
  return modulesFor(type).includes(module);
}

/** The plain-language refusal shown when a brand lacks a module. */
export function moduleRefusal(brandName: string, type: string | null | undefined, module: ModuleId): string {
  return (
    `${brandName} is set up for ${businessTypeLabel(type).toLowerCase()}, so its ${MODULE_LABELS[module]} ` +
    `features are switched off. To use them, change the business type on the brand's Overview.`
  );
}

// ----------------------------------------------------------------------------
// Extension point: how a module plugs into a brand's screens.
// ----------------------------------------------------------------------------

export interface BrandTab {
  label: string;
  /** Path under /brands/<id>, starting with "/". */
  path: string;
  /** Other paths under /brands/<id> that belong to this tab, such as a page editor. */
  alsoMatches?: string[];
}

export interface ModuleDefinition {
  id: ModuleId;
  label: string;
  /** One sentence on what the module gives a brand. */
  summary: string;
  tabs: BrandTab[];
}

export const OVERVIEW_TAB: BrandTab = { label: "Overview", path: "" };

/** The overview, then the tabs of each module the brand has, in module order. */
export function tabsFor(type: string | null | undefined, modules: ModuleDefinition[]): BrandTab[] {
  const enabled = modulesFor(type);
  return [OVERVIEW_TAB, ...modules.filter((module) => enabled.includes(module.id)).flatMap((module) => module.tabs)];
}

/** Which tab the current address belongs to. The overview matches only its own address. */
export function currentTab(pathname: string, brandBase: string, tabs: BrandTab[]): BrandTab | undefined {
  const rest = pathname.startsWith(brandBase) ? pathname.slice(brandBase.length).replace(/\/$/, "") : null;
  if (rest === null) return undefined;
  if (rest === "") return tabs.find((tab) => tab.path === "");
  const within = (prefix: string) => prefix !== "" && (rest === prefix || rest.startsWith(`${prefix}/`));
  return tabs.find((tab) => within(tab.path) || (tab.alsoMatches ?? []).some(within));
}
