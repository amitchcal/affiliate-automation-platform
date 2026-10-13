import { describe, expect, it } from "vitest";
import {
  businessTypeLabel,
  currentTab,
  hasModule,
  isBusinessType,
  ModuleDefinition,
  moduleRefusal,
  modulesFor,
  tabsFor,
} from "./modules";

const AFFILIATE: ModuleDefinition = {
  id: "affiliate",
  label: "Affiliate marketing",
  summary: "",
  tabs: [
    { label: "Offers", path: "/offers" },
    { label: "Site and links", path: "/site", alsoMatches: ["/pages"] },
    { label: "Results", path: "/results" },
  ],
};
const DROPSHIPPING: ModuleDefinition = {
  id: "dropshipping",
  label: "Dropshipping",
  summary: "",
  tabs: [{ label: "Products", path: "/products" }],
};
const MODULES = [AFFILIATE, DROPSHIPPING];

describe("modulesFor (T-07)", () => {
  it("switches on the modules of each business type", () => {
    expect(modulesFor("affiliate")).toEqual(["affiliate"]);
    expect(modulesFor("dropshipping")).toEqual(["dropshipping"]);
    expect(modulesFor("both")).toEqual(["affiliate", "dropshipping"]);
  });

  it("switches on nothing for an unknown or missing type", () => {
    expect(modulesFor("retail")).toEqual([]);
    expect(modulesFor(null)).toEqual([]);
    expect(modulesFor(undefined)).toEqual([]);
  });

  it("answers whether a brand has a module", () => {
    expect(hasModule("affiliate", "affiliate")).toBe(true);
    expect(hasModule("affiliate", "dropshipping")).toBe(false);
    expect(hasModule("dropshipping", "affiliate")).toBe(false);
    expect(hasModule("both", "dropshipping")).toBe(true);
  });
});

describe("business type labels", () => {
  it("accepts only the three types", () => {
    expect(isBusinessType("both")).toBe(true);
    expect(isBusinessType("Both")).toBe(false);
    expect(isBusinessType("")).toBe(false);
  });

  it("names each type in plain words", () => {
    expect(businessTypeLabel("affiliate")).toBe("Affiliate marketing");
    expect(businessTypeLabel("dropshipping")).toBe("Dropshipping");
    expect(businessTypeLabel(undefined)).toBe("Not set");
  });

  it("explains a refusal in a sentence the client can act on", () => {
    expect(moduleRefusal("Famperia", "dropshipping", "affiliate")).toBe(
      "Famperia is set up for dropshipping, so its affiliate marketing features are switched off. " +
        "To use them, change the business type on the brand's Overview.",
    );
  });
});

describe("brand tabs", () => {
  it("shows only the tabs of enabled modules, after the overview", () => {
    expect(tabsFor("affiliate", MODULES).map((tab) => tab.label)).toEqual([
      "Overview",
      "Offers",
      "Site and links",
      "Results",
    ]);
    expect(tabsFor("dropshipping", MODULES).map((tab) => tab.label)).toEqual(["Overview", "Products"]);
    expect(tabsFor("both", MODULES)).toHaveLength(5);
    expect(tabsFor("unknown", MODULES).map((tab) => tab.label)).toEqual(["Overview"]);
  });

  it("marks the tab for the current address", () => {
    const tabs = tabsFor("affiliate", MODULES);
    const base = "/brands/b1";
    expect(currentTab("/brands/b1", base, tabs)?.label).toBe("Overview");
    expect(currentTab("/brands/b1/", base, tabs)?.label).toBe("Overview");
    expect(currentTab("/brands/b1/offers", base, tabs)?.label).toBe("Offers");
    expect(currentTab("/brands/b1/pages/p9", base, tabs)?.label).toBe("Site and links");
    expect(currentTab("/brands/b1/sitemap", base, tabs)).toBeUndefined();
    expect(currentTab("/clients", base, tabs)).toBeUndefined();
  });
});
