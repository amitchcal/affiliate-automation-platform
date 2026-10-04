import type { OfferInput, Level } from "@/scoring/config";

export interface MetricsRow {
  captured_on: string;
  payout: number | string | null;
  conversion_rate: number | string | null;
  epc: number | string | null;
  gravity: number | string | null;
  refund_rate: number | string | null;
  recurring: boolean | null;
}

export interface RulesRow {
  compliance_risk: Level | null;
  seller_restrictions: Level | null;
  approved: boolean;
  terms_url: string | null;
}

const toNumber = (value: number | string | null | undefined): number | undefined =>
  value === null || value === undefined || value === "" ? undefined : Number(value);

/** The most recent dated figures for an offer (O-02). */
export function latestMetrics(rows: MetricsRow[] | null | undefined): MetricsRow | undefined {
  if (!rows || rows.length === 0) return undefined;
  return [...rows].sort((a, b) => b.captured_on.localeCompare(a.captured_on))[0];
}

/** Builds the scoring engine's input from stored rows. Missing stays missing (O-08). */
export function toOfferInput(
  name: string,
  metrics: MetricsRow | undefined,
  rules: RulesRow | null | undefined,
): OfferInput {
  return {
    name,
    payout: toNumber(metrics?.payout),
    conversionRate: toNumber(metrics?.conversion_rate),
    epc: toNumber(metrics?.epc),
    gravity: toNumber(metrics?.gravity),
    refundRate: toNumber(metrics?.refund_rate),
    recurring: metrics?.recurring ?? undefined,
    complianceRisk: rules?.compliance_risk ?? undefined,
    sellerRestrictions: rules?.seller_restrictions ?? undefined,
  };
}

/** Reads an optional number from a form field. Blank means "not known". */
export function formNumber(value: FormDataEntryValue | null): number | undefined {
  const text = String(value ?? "").trim();
  if (text === "") return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function formLevel(value: FormDataEntryValue | null): Level | undefined {
  const text = String(value ?? "");
  return text === "low" || text === "medium" || text === "high" ? text : undefined;
}
