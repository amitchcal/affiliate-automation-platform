/**
 * Content compliance check (K-05), run before any page is published.
 *
 * The built-in rules come from ClickBank's promotional guidelines and US
 * advertising rules as recorded in the project's compliance checklist:
 * no unsubstantiated superlatives, no false scarcity, no absolute or health
 * claims, and no wording that implies first-hand use of the product.
 * Each offer's own banned claims (C-03) are checked as well.
 *
 * This is a first line of defence, not legal review. It catches wording;
 * it cannot judge whether a factual claim is true.
 */

export interface Problem {
  rule: string;
  match: string;
}

export interface ComplianceResult {
  pass: boolean;
  problems: Problem[];
}

interface Rule {
  rule: string;
  pattern: RegExp;
}

const RULES: Rule[] = [
  {
    rule: "Unsubstantiated superlative",
    pattern: /\bthe best\b|\bbest (?:\w+ )?(?:course|program|programme|product|choice|option|deal|price|way|solution)\b|#\s?1\b|\bnumber one\b|\btop[- ]rated\b|\bworld'?s (?:best|leading|first)\b/gi,
  },
  {
    rule: "False scarcity or urgency",
    pattern: /\bonly today\b|\blimited[- ]time\b|\bhurry\b|\bact now\b|\blast chance\b|\bwhile supplies last\b|\bexpires? (?:soon|today|tonight)\b|\bonly \d+ (?:left|spots|copies)\b/gi,
  },
  {
    rule: "Absolute or health claim",
    pattern: /(?<!money-back )\bguaranteed?\b(?! by the (?:seller|publisher))|\b100% (?:effective|safe|proven)\b|\brisk[- ]free\b|\bmiracle\b|\bcures?\b|\bclinically proven\b|\bscientifically proven\b|\binstant results?\b/gi,
  },
  {
    rule: "Implies first-hand use of the product",
    pattern: /\b(?:we|i) (?:tested|tried|used|bought)\b|\bour (?:testing|test results|experience with)\b|\bmy results\b|\bin our experience\b|\bhands-on review\b(?<!not a hands-on review)/gi,
  },
];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function checkContent(text: string, bannedClaims: string[] = []): ComplianceResult {
  const problems: Problem[] = [];
  const seen = new Set<string>();
  const add = (rule: string, match: string) => {
    const key = `${rule}|${match.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      problems.push({ rule, match });
    }
  };

  for (const { rule, pattern } of RULES) {
    for (const found of text.matchAll(pattern)) add(rule, found[0]);
  }
  for (const claim of bannedClaims) {
    const phrase = claim.trim();
    if (!phrase) continue;
    const found = text.match(new RegExp(escapeRegExp(phrase), "i"));
    if (found) add("Banned by the seller's rules", found[0]);
  }
  return { pass: problems.length === 0, problems };
}

/** One sentence per problem, for showing to the person publishing. */
export function describeProblems(result: ComplianceResult): string {
  return result.problems.map((p) => `${p.rule}: "${p.match}"`).join("; ");
}
