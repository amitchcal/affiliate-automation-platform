/**
 * Offer scoring configuration.
 *
 * Stories: C-08 (weights and thresholds held in configuration),
 *          O-03 (weighted score with a plain-language explanation).
 *
 * Nothing in this file is hard-wired into the scoring logic. In production the
 * same shape is loaded from the `scoring_configs` table, so the owner can tune
 * it without a code change.
 */

export type ParameterKey =
  | "epc"
  | "payout"
  | "conversionRate"
  | "complianceRisk"
  | "gravity"
  | "sellerRestrictions"
  | "recurring"
  | "refundRate";

export type Level = "low" | "medium" | "high";

/** What we know about an offer. Any figure may be missing (story O-08). */
export interface OfferInput {
  name: string;
  /** Earnings per click, in the account currency. */
  epc?: number;
  /** Average commission per sale. */
  payout?: number;
  /** Conversion rate as a percentage, e.g. 1.57 for 1.57%. */
  conversionRate?: number;
  /** ClickBank-style gravity. */
  gravity?: number;
  /** Refund rate as a percentage. */
  refundRate?: number;
  /** True if a sale keeps paying commission after the first purchase. */
  recurring?: boolean;
  /** From the offer's rules record: how restricted the claims are. */
  complianceRisk?: Level;
  /** From the offer's rules record: how tightly the seller limits promotion. */
  sellerRestrictions?: Level;
}

/** Linear scale: `zero` maps to 0, `full` maps to 100, capped at both ends. */
export interface LinearScale {
  zero: number;
  full: number;
}

export interface ScoringConfig {
  /** Must total 100 (enforced by validateConfig). */
  weights: Record<ParameterKey, number>;
  scales: {
    epc: LinearScale;
    payout: LinearScale;
    conversionRate: LinearScale;
    gravity: LinearScale;
    /** Lower is better, so `zero` is the higher number. */
    refundRate: LinearScale;
  };
  /** Score given to each level for the two rules-record parameters. */
  levelScores: Record<Level, number>;
  /** Below this score an offer is rejected even for organic traffic. */
  minimumScore: number;
  /** Gravity below this means the offer is effectively not selling. */
  minimumGravity: number;
  /** What a paid click is expected to cost for this brand's audience. */
  expectedCostPerClick: number;
}

export const DEFAULT_CONFIG: ScoringConfig = {
  weights: {
    epc: 25,
    payout: 15,
    conversionRate: 15,
    complianceRisk: 15,
    gravity: 10,
    sellerRestrictions: 10,
    recurring: 5,
    refundRate: 5,
  },
  scales: {
    epc: { zero: 0, full: 1.0 },
    payout: { zero: 0, full: 60 },
    conversionRate: { zero: 0, full: 2.0 },
    gravity: { zero: 0, full: 50 },
    refundRate: { zero: 20, full: 0 },
  },
  levelScores: { low: 100, medium: 50, high: 0 },
  minimumScore: 30,
  minimumGravity: 1,
  expectedCostPerClick: 0.8,
};

export const PARAMETER_LABELS: Record<ParameterKey, string> = {
  epc: "earnings per click",
  payout: "payout per sale",
  conversionRate: "conversion rate",
  complianceRisk: "compliance risk",
  gravity: "gravity",
  sellerRestrictions: "seller restrictions",
  recurring: "recurring commission",
  refundRate: "refund rate",
};

/** C-08 acceptance: weights must total 100. */
export function validateConfig(config: ScoringConfig): void {
  const total = Object.values(config.weights).reduce((a, b) => a + b, 0);
  if (Math.abs(total - 100) > 1e-9) {
    throw new Error(`Scoring weights must total 100, but total ${total}.`);
  }
  for (const [key, weight] of Object.entries(config.weights)) {
    if (weight < 0) throw new Error(`Weight for ${key} cannot be negative.`);
  }
  if (config.expectedCostPerClick <= 0) {
    throw new Error("Expected cost per click must be greater than zero.");
  }
}
