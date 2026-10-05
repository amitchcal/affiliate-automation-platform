import { describe, expect, it } from "vitest";
import { checkContent, describeProblems } from "./compliance";

describe("checkContent (K-05)", () => {
  it("passes plain descriptive copy", () => {
    const text =
      "An online, reward-based course taught through games. The publisher states a 60-day money-back guarantee. " +
      "It is an overview, not a hands-on review: we have not put a dog through the course ourselves. " +
      "People who learn best in a live class should look elsewhere.";
    expect(checkContent(text)).toEqual({ pass: true, problems: [] });
  });

  it("flags unsubstantiated superlatives", () => {
    const result = checkContent("This is the best course and the #1 choice. A top-rated program.");
    expect(result.pass).toBe(false);
    expect(result.problems.map((p) => p.rule)).toContain("Unsubstantiated superlative");
    expect(result.problems.length).toBeGreaterThanOrEqual(3);
  });

  it("flags false scarcity", () => {
    const result = checkContent("Hurry, this limited-time price ends soon. Only 3 left.");
    expect(result.problems.every((p) => p.rule === "False scarcity or urgency")).toBe(true);
    expect(result.problems.length).toBe(3);
  });

  it("flags absolute and health claims but not a seller's stated refund guarantee", () => {
    expect(checkContent("Results are guaranteed.").pass).toBe(false);
    expect(checkContent("It cures barking with instant results.").pass).toBe(false);
    expect(checkContent("The seller offers a money-back guarantee.").pass).toBe(true);
  });

  it("flags wording that implies we used the product", () => {
    expect(checkContent("We tested it for a month.").pass).toBe(false);
    expect(checkContent("In our experience it works.").pass).toBe(false);
  });

  it("flags each seller's own banned claims, ignoring case", () => {
    const result = checkContent("It will raise your child's IQ.", ["raise your child's iq"]);
    expect(result.problems).toEqual([{ rule: "Banned by the seller's rules", match: "raise your child's IQ" }]);
  });

  it("reports each distinct problem once, in readable form", () => {
    const result = checkContent("Act now. Act now. ACT NOW.");
    expect(result.problems.length).toBe(1);
    expect(describeProblems(result)).toBe('False scarcity or urgency: "Act now"');
  });
});
