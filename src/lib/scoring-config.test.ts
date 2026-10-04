import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/scoring/config";
import { configFromRow, pickConfigRow, ScoringConfigRow } from "./scoring-config";

const base: ScoringConfigRow = {
  client_id: null,
  brand_id: null,
  weights: DEFAULT_CONFIG.weights,
  scales: null,
  level_scores: null,
  minimum_score: 30,
  minimum_gravity: "1",
  expected_cost_per_click: "0.80",
};

describe("configFromRow (C-08)", () => {
  it("converts numeric strings from the database into numbers", () => {
    const config = configFromRow(base);
    expect(config.expectedCostPerClick).toBe(0.8);
    expect(config.minimumGravity).toBe(1);
  });

  it("falls back to default scales and level scores when none are stored", () => {
    const config = configFromRow(base);
    expect(config.scales).toEqual(DEFAULT_CONFIG.scales);
    expect(config.levelScores).toEqual(DEFAULT_CONFIG.levelScores);
  });

  it("rejects a stored row whose weights do not total 100", () => {
    const bad = { ...base, weights: { ...DEFAULT_CONFIG.weights, epc: 40 } };
    expect(() => configFromRow(bad)).toThrow(/total 100/);
  });
});

describe("pickConfigRow", () => {
  const platform = { ...base };
  const client = { ...base, client_id: "c1", expected_cost_per_click: "0.60" };
  const brand = { ...base, client_id: "c1", brand_id: "b1", expected_cost_per_click: "0.40" };

  it("prefers the brand's configuration", () => {
    expect(pickConfigRow([platform, client, brand], "c1", "b1")).toBe(brand);
  });
  it("then the client's", () => {
    expect(pickConfigRow([platform, client, brand], "c1", "b2")).toBe(client);
  });
  it("then the platform default", () => {
    expect(pickConfigRow([platform, client, brand], "c2", "b9")).toBe(platform);
  });
});
