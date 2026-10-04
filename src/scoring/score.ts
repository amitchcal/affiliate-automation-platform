/**
 * Offer scoring.
 *
 * Stories: O-03 (weighted score, break-even cost per click, recommended
 *          channel, plain-language explanation)
 *          O-08 (client-supplied offers: report what is missing, mark the
 *          score provisional until the seller's terms are recorded)
 *
 * Pure functions only: no database, no network. The same code scores a
 * suggested offer and a client-supplied one.
 */

import {
  DEFAULT_CONFIG,
  LinearScale,
  OfferInput,
  PARAMETER_LABELS,
  ParameterKey,
  ScoringConfig,
  validateConfig,
} from "./config";

export type Channel = "paid" | "organic" | "reject" | "needs_data";

export interface ParameterResult {
  key: ParameterKey;
  /** 0 to 100, or undefined when the figure is missing. */
  score: number | undefined;
  weight: number;
}

export interface OfferScore {
  name: string;
  /** 0 to 100, rounded. Weighted over the parameters that are known. */
  score: number;
  parameters: ParameterResult[];
  /** Figures that were not supplied (O-08: "shows what is missing"). */
  missing: ParameterKey[];
  /** True until both rules-record parameters are known (O-08). */
  provisional: boolean;
  /** What one visitor is expected to earn; the most a click may cost. */
  breakEvenCostPerClick: number | undefined;
  channel: Channel;
  explanation: string;
}

const PARAMETER_ORDER: ParameterKey[] = [
  "epc",
  "payout",
  "conversionRate",
  "complianceRisk",
  "gravity",
  "sellerRestrictions",
  "recurring",
  "refundRate",
];

function linear(value: number, scale: LinearScale): number {
  const span = scale.full - scale.zero;
  if (span === 0) return 0;
  const fraction = (value - scale.zero) / span;
  return Math.max(0, Math.min(1, fraction)) * 100;
}

function parameterScore(
  key: ParameterKey,
  offer: OfferInput,
  config: ScoringConfig,
): number | undefined {
  switch (key) {
    case "epc":
    case "payout":
    case "conversionRate":
    case "gravity":
    case "refundRate": {
      const value = offer[key];
      return value === undefined ? undefined : linear(value, config.scales[key]);
    }
    case "recurring":
      return offer.recurring === undefined ? undefined : offer.recurring ? 100 : 0;
    case "complianceRisk":
    case "sellerRestrictions": {
      const level = offer[key];
      return level === undefined ? undefined : config.levelScores[level];
    }
  }
}

/** Expected earnings from one visitor: the most a paid click may cost. */
function breakEven(offer: OfferInput): number | undefined {
  if (offer.payout !== undefined && offer.conversionRate !== undefined) {
    return (offer.payout * offer.conversionRate) / 100;
  }
  return offer.epc;
}

/** An offer that is not selling is rejected whatever its score. */
function notSellingReason(offer: OfferInput, config: ScoringConfig): string | undefined {
  if (offer.conversionRate === 0 || offer.epc === 0) {
    return "it shows no measurable sales";
  }
  if (offer.gravity !== undefined && offer.gravity < config.minimumGravity) {
    return "almost no affiliates are selling it";
  }
  return undefined;
}

const STRENGTHS: Partial<Record<ParameterKey, string>> = {
  epc: "each visitor is worth a good amount",
  payout: "it pays well per sale",
  conversionRate: "a good share of visitors buy",
  gravity: "many affiliates are selling it",
  complianceRisk: "its claims carry little compliance risk",
  sellerRestrictions: "the seller places few limits on promotion",
  recurring: "a sale keeps paying over time",
  refundRate: "few sales are refunded",
};

const WEAKNESSES: Partial<Record<ParameterKey, string>> = {
  epc: "each visitor is worth little",
  payout: "it pays little per sale",
  conversionRate: "few visitors buy",
  gravity: "few affiliates are selling it",
  complianceRisk: "its claims are tightly regulated",
  sellerRestrictions: "the seller limits how it can be promoted",
  refundRate: "many sales are refunded",
};

function joinPhrases(phrases: string[]): string {
  if (phrases.length <= 1) return phrases.join("");
  return `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

function explain(
  result: Omit<OfferScore, "explanation">,
  offer: OfferInput,
  config: ScoringConfig,
): string {
  const sentences: string[] = [];

  sentences.push(
    result.provisional
      ? `Scores ${result.score} out of 100, provisional until the seller's terms are recorded.`
      : `Scores ${result.score} out of 100.`,
  );

  // Strongest and weakest points, heaviest weights first, two of each at most.
  const known = result.parameters
    .filter((p) => p.score !== undefined)
    .sort((a, b) => b.weight - a.weight);
  const strengths = known
    .filter((p) => p.score! >= 70 && STRENGTHS[p.key])
    .slice(0, 2)
    .map((p) => STRENGTHS[p.key]!);
  const weaknesses = known
    .filter((p) => p.score! <= 35 && WEAKNESSES[p.key])
    .slice(0, 2)
    .map((p) => WEAKNESSES[p.key]!);

  if (strengths.length && weaknesses.length) {
    sentences.push(`${capitalise(joinPhrases(strengths))}, but ${joinPhrases(weaknesses)}.`);
  } else if (strengths.length) {
    sentences.push(`${capitalise(joinPhrases(strengths))}.`);
  } else if (weaknesses.length) {
    sentences.push(`${capitalise(joinPhrases(weaknesses))}.`);
  }

  const visitorValue = result.breakEvenCostPerClick;
  const clickCost = money(config.expectedCostPerClick);
  switch (result.channel) {
    case "paid":
      sentences.push(
        `A visitor is worth about ${money(visitorValue!)}, which covers the expected ${clickCost} cost of a paid click, so paid ads are worth testing.`,
      );
      break;
    case "organic":
      sentences.push(
        `A visitor is worth about ${money(visitorValue!)}, less than the expected ${clickCost} cost of a paid click, so promote it through articles and social posts, not paid ads.`,
      );
      break;
    case "reject": {
      const reason = notSellingReason(offer, config) ?? "its score is below the minimum";
      sentences.push(`Not recommended, because ${reason}.`);
      break;
    }
    case "needs_data":
      sentences.push(
        `A channel cannot be recommended yet. Still needed: ${joinPhrases(
          result.missing.map((key) => PARAMETER_LABELS[key]),
        )}.`,
      );
      break;
  }

  return sentences.join(" ");
}

export function scoreOffer(offer: OfferInput, config: ScoringConfig = DEFAULT_CONFIG): OfferScore {
  validateConfig(config);

  const parameters: ParameterResult[] = PARAMETER_ORDER.map((key) => ({
    key,
    score: parameterScore(key, offer, config),
    weight: config.weights[key],
  }));

  const known = parameters.filter((p) => p.score !== undefined);
  const knownWeight = known.reduce((sum, p) => sum + p.weight, 0);
  const weighted = known.reduce((sum, p) => sum + p.score! * p.weight, 0);
  const score = knownWeight === 0 ? 0 : Math.round(weighted / knownWeight);

  const missing = parameters.filter((p) => p.score === undefined).map((p) => p.key);
  const provisional =
    offer.complianceRisk === undefined || offer.sellerRestrictions === undefined;

  const breakEvenCostPerClick = breakEven(offer);

  let channel: Channel;
  if (notSellingReason(offer, config)) {
    channel = "reject";
  } else if (breakEvenCostPerClick === undefined) {
    channel = "needs_data";
  } else if (score < config.minimumScore) {
    channel = "reject";
  } else if (breakEvenCostPerClick >= config.expectedCostPerClick) {
    channel = "paid";
  } else {
    channel = "organic";
  }

  const partial = {
    name: offer.name,
    score,
    parameters,
    missing,
    provisional,
    breakEvenCostPerClick,
    channel,
  };
  return { ...partial, explanation: explain(partial, offer, config) };
}

/** Scores a list and returns it best first, for the client's selection screen. */
export function rankOffers(offers: OfferInput[], config: ScoringConfig = DEFAULT_CONFIG): OfferScore[] {
  const order: Record<Channel, number> = { paid: 0, organic: 1, needs_data: 2, reject: 3 };
  return offers
    .map((offer) => scoreOffer(offer, config))
    .sort((a, b) => order[a.channel] - order[b.channel] || b.score - a.score);
}
