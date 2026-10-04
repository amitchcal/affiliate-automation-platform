import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_CONFIG, ScoringConfig, validateConfig } from "@/scoring/config";

/** A row of the scoring_configs table, as stored. */
export interface ScoringConfigRow {
  client_id: string | null;
  brand_id: string | null;
  weights: ScoringConfig["weights"];
  scales: Partial<ScoringConfig["scales"]> | null;
  level_scores: ScoringConfig["levelScores"] | null;
  minimum_score: number;
  minimum_gravity: number | string;
  expected_cost_per_click: number | string;
}

/** Turns a stored row into the shape the scoring engine expects (C-08). */
export function configFromRow(row: ScoringConfigRow): ScoringConfig {
  const config: ScoringConfig = {
    weights: row.weights,
    scales: { ...DEFAULT_CONFIG.scales, ...(row.scales ?? {}) },
    levelScores: row.level_scores ?? DEFAULT_CONFIG.levelScores,
    minimumScore: row.minimum_score,
    minimumGravity: Number(row.minimum_gravity),
    expectedCostPerClick: Number(row.expected_cost_per_click),
  };
  validateConfig(config);
  return config;
}

/**
 * Picks the most specific configuration: the brand's, then the client's,
 * then the platform default.
 */
export function pickConfigRow(
  rows: ScoringConfigRow[],
  clientId: string,
  brandId: string,
): ScoringConfigRow | undefined {
  return (
    rows.find((r) => r.brand_id === brandId) ??
    rows.find((r) => r.client_id === clientId && r.brand_id === null) ??
    rows.find((r) => r.client_id === null && r.brand_id === null)
  );
}

export async function loadScoringConfig(
  supabase: SupabaseClient,
  clientId: string,
  brandId: string,
): Promise<ScoringConfig> {
  const { data, error } = await supabase.from("scoring_configs").select("*");
  if (error) throw new Error(`Could not load the scoring configuration: ${error.message}`);
  const row = pickConfigRow((data ?? []) as ScoringConfigRow[], clientId, brandId);
  return row ? configFromRow(row) : DEFAULT_CONFIG;
}
