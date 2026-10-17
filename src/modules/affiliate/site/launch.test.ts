import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkContent } from "@/core/compliance/compliance";
import { CHECKLIST_LABELS, checklistReason, LAUNCH_REFUSALS, launchRefusalMessage, SIGNUP_MESSAGES, signupOutcome } from "./launch";

const migration = (name: string) => readFileSync(path.join(__dirname, "../../../../supabase/migrations", name), "utf8");
const codes = (text: string) => [...text.matchAll(/raise exception '([a-z_]+)'/g)].map((m) => m[1]);

describe("going live and sign-up messages (S-01, S-08)", () => {
  it("every refusal code raised by 0010 to 0012 has a message", () => {
    const all = new Set([
      ...codes(migration("0010_sites_and_domains.sql")),
      ...codes(migration("0011_subscribers_and_consent.sql")),
      ...codes(migration("0012_privacy_template_signup.sql")),
    ]);
    expect(all.size).toBeGreaterThan(20);
    for (const code of all) {
      const known = code in LAUNCH_REFUSALS || code in SIGNUP_MESSAGES;
      expect(known, code).toBe(true);
    }
  });

  it("never shows database wording", () => {
    expect(launchRefusalMessage('new row violates row-level security policy for table "brand_domains"')).toMatch(/^That did not work/);
    expect(launchRefusalMessage("page_site_live")).toBe(LAUNCH_REFUSALS.page_site_live);
    expect(signupOutcome("permission denied for function subscribe")).toBe("signup_unavailable");
    expect(signupOutcome("signup_wording_changed")).toBe("signup_wording_changed");
    expect(signupOutcome("done")).toBe("signup_unavailable");
  });

  it("names every checklist item and why it fails", () => {
    for (const key of Object.keys(CHECKLIST_LABELS)) {
      expect(checklistReason({ key, passed: false, detail: null })).toMatch(/\S/);
    }
    expect(checklistReason({ key: "details", passed: false, detail: "address" })).toBe(
      "Business details are missing: address. Fill them in on the Overview tab.",
    );
    expect(checklistReason({ key: "domain", passed: false, detail: "brand.com" })).toMatch(/failed for brand\.com/);
  });

  it("the public form's own wording passes the compliance check (no superlatives, no urgency)", () => {
    for (const text of [...Object.values(SIGNUP_MESSAGES), "Get updates from AffilyVault", "Sign up"]) {
      expect(checkContent(text).pass, text).toBe(true);
    }
  });
});
