import { describe, expect, it } from "vitest";
import { formLevel, formNumber, latestMetrics, toOfferInput } from "./offers";

describe("toOfferInput (O-08)", () => {
  it("keeps unknown figures as missing, not zero", () => {
    const input = toOfferInput("X", { captured_on: "2026-10-04", payout: "42.25", conversion_rate: null, epc: null, gravity: "14.92", refund_rate: null, recurring: null }, null);
    expect(input.payout).toBe(42.25);
    expect(input.conversionRate).toBeUndefined();
    expect(input.recurring).toBeUndefined();
    expect(input.complianceRisk).toBeUndefined();
  });

  it("keeps a real zero as zero", () => {
    const input = toOfferInput("X", { captured_on: "2026-10-04", payout: 21.34, conversion_rate: 0, epc: 0, gravity: 0.7, refund_rate: null, recurring: false }, null);
    expect(input.conversionRate).toBe(0);
    expect(input.recurring).toBe(false);
  });
});

describe("latestMetrics (O-02)", () => {
  it("returns the most recent dated row", () => {
    const row = latestMetrics([
      { captured_on: "2026-09-01", payout: 1, conversion_rate: null, epc: null, gravity: null, refund_rate: null, recurring: null },
      { captured_on: "2026-10-04", payout: 2, conversion_rate: null, epc: null, gravity: null, refund_rate: null, recurring: null },
    ]);
    expect(row?.payout).toBe(2);
  });
});

describe("form helpers", () => {
  it("treats blank and invalid numbers as not known", () => {
    expect(formNumber("")).toBeUndefined();
    expect(formNumber("abc")).toBeUndefined();
    expect(formNumber("-3")).toBeUndefined();
    expect(formNumber("0")).toBe(0);
    expect(formNumber(" 1.57 ")).toBe(1.57);
  });
  it("accepts only the three levels", () => {
    expect(formLevel("low")).toBe("low");
    expect(formLevel("unknown")).toBeUndefined();
  });
});
