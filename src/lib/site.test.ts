import { describe, expect, it } from "vitest";
import { checkContent } from "./compliance";
import { fillTemplate, missingDetails, offerPageStarter, slugify } from "./site";

describe("slugify", () => {
  it("makes a URL-safe slug", () => {
    expect(slugify("Brain Training for Dogs!")).toBe("brain-training-for-dogs");
    expect(slugify("  Café & Crème  ")).toBe("cafe-creme");
    expect(slugify("---")).toBe("");
  });
  it("produces slugs the database accepts", () => {
    expect(slugify("A".repeat(80) + " b")).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe("fillTemplate (C-04)", () => {
  it("substitutes the brand's particulars and leaves unknown placeholders", () => {
    const out = fillTemplate("{{brand}} at {{domain}}, run by {{operator}}. {{unknown}}", {
      brand: "AffiQube", domain: "affiqube.com", operator: "Vividha Marketing",
    });
    expect(out).toBe("AffiQube at affiqube.com, run by Vividha Marketing. {{unknown}}");
  });
});

describe("missingDetails", () => {
  it("lists what is needed before standard pages can be created", () => {
    expect(missingDetails({ operator: "X" })).toEqual(["address", "contact email"]);
    expect(missingDetails({ operator: "X", address: "Y", email: "z@x.test" })).toEqual([]);
  });
});

describe("offerPageStarter", () => {
  it("passes the compliance check as written", () => {
    expect(checkContent(offerPageStarter("Example Course")).pass).toBe(true);
  });
});
