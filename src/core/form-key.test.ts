import { describe, expect, it } from "vitest";
import { savedValuesKey } from "./form-key";

describe("savedValuesKey: forms are redrawn after a save", () => {
  const details = { operator: "Vividha Marketing", email: "a@example.com", address: "Kolkata", tagline: "Tools" };

  it("is the same for the same saved values, whatever the key order", () => {
    const reordered = { tagline: "Tools", address: "Kolkata", email: "a@example.com", operator: "Vividha Marketing" };
    expect(savedValuesKey(details)).toBe(savedValuesKey(reordered));
  });

  it("changes when any one saved value changes", () => {
    const keys = new Set([
      savedValuesKey(details),
      savedValuesKey({ ...details, operator: "Someone else" }),
      savedValuesKey({ ...details, tagline: "" }),
      savedValuesKey({ niche: "pets", platforms: ["articles"] }),
      savedValuesKey({ niche: "pets", platforms: ["articles", "pinterest"] }),
      savedValuesKey({ niche: "pets", platforms: ["pinterest", "articles"] }),
      savedValuesKey("affiliate"),
      savedValuesKey("both"),
    ]);
    expect(keys.size).toBe(8);
  });

  it("tells an empty value apart from a missing one and from null", () => {
    expect(savedValuesKey({ niche: "" })).not.toBe(savedValuesKey({ niche: null }));
    expect(savedValuesKey({ niche: null })).not.toBe(savedValuesKey({}));
  });

  it("stays short for a long page body", () => {
    expect(savedValuesKey({ body: "x".repeat(50_000) }).length).toBeLessThanOrEqual(7);
  });
});
