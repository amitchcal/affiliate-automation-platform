import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, OfferInput, ScoringConfig } from "./config";
import { rankOffers, scoreOffer } from "./score";

/**
 * Fixtures are the real marketplace figures seen during the AffilyVault
 * launch (ClickBank, October 2026), so the engine is tested against decisions
 * that were already reasoned through by hand.
 */
const brainTraining: OfferInput = {
  name: "Brain Training for Dogs",
  payout: 42.25,
  conversionRate: 0.4,
  epc: 0.17,
  gravity: 14.92,
  recurring: false,
  complianceRisk: "low",
  sellerRestrictions: "low",
};

const childrenReading: OfferInput = {
  name: "Children Learning Reading",
  payout: 27.06,
  conversionRate: 1.57,
  epc: 0.43,
  gravity: 7.0,
  recurring: false,
  complianceRisk: "low",
  sellerRestrictions: "high",
};

const babySleep: OfferInput = {
  name: "Baby Sleep Miracle",
  payout: 21.34,
  conversionRate: 0,
  epc: 0,
  gravity: 0.7,
  recurring: false,
};

const strongOffer: OfferInput = {
  name: "High-payout offer",
  payout: 48.78,
  conversionRate: 1.94,
  epc: 0.98,
  gravity: 87.7,
  recurring: false,
  complianceRisk: "low",
  sellerRestrictions: "low",
};

describe("scoreOffer (O-03)", () => {
  it("recommends organic when a visitor earns less than a paid click costs", () => {
    const result = scoreOffer(brainTraining);
    expect(result.channel).toBe("organic");
    expect(result.breakEvenCostPerClick).toBeCloseTo(0.169, 3);
    expect(result.provisional).toBe(false);
    expect(result.explanation).toContain("not paid ads");
  });

  it("recommends paid when a visitor earns at least the expected click cost", () => {
    const result = scoreOffer(strongOffer);
    expect(result.channel).toBe("paid");
    expect(result.breakEvenCostPerClick).toBeCloseTo(0.946, 3);
    expect(result.score).toBeGreaterThan(80);
  });

  it("rejects an offer with no measurable sales, whatever else it shows", () => {
    const result = scoreOffer(babySleep);
    expect(result.channel).toBe("reject");
    expect(result.explanation).toContain("no measurable sales");
  });

  it("rejects an offer that almost no affiliates are selling", () => {
    const result = scoreOffer({ name: "Quiet offer", payout: 30, conversionRate: 1, gravity: 0.4 });
    expect(result.channel).toBe("reject");
    expect(result.explanation).toContain("almost no affiliates");
  });

  it("names the seller's restrictions as a weakness in plain language", () => {
    const result = scoreOffer(childrenReading);
    expect(result.channel).toBe("organic");
    expect(result.explanation).toContain("the seller limits how it can be promoted");
  });

  it("gives a score between 0 and 100 and an explanation for every offer", () => {
    for (const offer of [brainTraining, childrenReading, babySleep, strongOffer]) {
      const result = scoreOffer(offer);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.explanation).toMatch(/^Scores \d+ out of 100/);
    }
  });
});

describe("client-supplied offers (O-08)", () => {
  it("lists what is missing and asks for data before recommending a channel", () => {
    const result = scoreOffer({ name: "Client's product", gravity: 12 });
    expect(result.channel).toBe("needs_data");
    expect(result.missing).toContain("epc");
    expect(result.missing).toContain("conversionRate");
    expect(result.explanation).toContain("Still needed");
  });

  it("marks the score provisional until the seller's terms are recorded", () => {
    const withoutRules = scoreOffer({ name: "No rules yet", payout: 40, conversionRate: 1, epc: 0.4, gravity: 20 });
    expect(withoutRules.provisional).toBe(true);
    expect(withoutRules.explanation).toContain("provisional");

    const withRules = scoreOffer({
      name: "Rules recorded",
      payout: 40,
      conversionRate: 1,
      epc: 0.4,
      gravity: 20,
      complianceRisk: "low",
      sellerRestrictions: "medium",
    });
    expect(withRules.provisional).toBe(false);
  });

  it("weights only the figures that are known", () => {
    // With one known parameter at full marks, the score is 100, not 25.
    const result = scoreOffer({ name: "EPC only", epc: 1.0 });
    expect(result.score).toBe(100);
  });
});

describe("configuration (C-08)", () => {
  it("refuses weights that do not total 100", () => {
    const bad: ScoringConfig = {
      ...DEFAULT_CONFIG,
      weights: { ...DEFAULT_CONFIG.weights, epc: 30 },
    };
    expect(() => scoreOffer(brainTraining, bad)).toThrow(/total 100/);
  });

  it("changes the recommendation when the expected click cost changes", () => {
    const cheapClicks: ScoringConfig = { ...DEFAULT_CONFIG, expectedCostPerClick: 0.15 };
    expect(scoreOffer(brainTraining, cheapClicks).channel).toBe("paid");
  });

  it("changes the ranking when the weights change", () => {
    const payoutFirst: ScoringConfig = {
      ...DEFAULT_CONFIG,
      weights: { ...DEFAULT_CONFIG.weights, payout: 40, epc: 0 },
    };
    const before = scoreOffer(brainTraining).score;
    const after = scoreOffer(brainTraining, payoutFirst).score;
    expect(after).toBeGreaterThan(before);
  });
});

describe("rankOffers", () => {
  it("orders paid first, then organic, then rejected", () => {
    const ranked = rankOffers([babySleep, brainTraining, strongOffer, childrenReading]);
    expect(ranked.map((r) => r.channel)).toEqual(["paid", "organic", "organic", "reject"]);
    expect(ranked[0].name).toBe("High-payout offer");
    expect(ranked[3].name).toBe("Baby Sleep Miracle");
  });
});
