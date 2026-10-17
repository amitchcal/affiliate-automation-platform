import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  cleanCode,
  looksLikeCode,
  mayOpenBeforeSetup,
  mayRemoveAuthenticator,
  resetDoneMessage,
  resetRefusalMessage,
  RESET_REFUSALS,
  TWO_FACTOR_MESSAGES,
  twoFactorErrorMessage,
  twoFactorRequired,
} from "./two-factor";

describe("two-factor sign-in (T-05)", () => {
  it("is required for the owner, operators and client admins, and optional for viewers (Q1)", () => {
    expect(twoFactorRequired(["owner"])).toBe(true);
    expect(twoFactorRequired(["operator"])).toBe(true);
    expect(twoFactorRequired(["client_admin"])).toBe(true);
    expect(twoFactorRequired(["client_viewer"])).toBe(false);
    expect(twoFactorRequired([])).toBe(false);
    // Any required role anywhere makes it required.
    expect(twoFactorRequired(["client_viewer", "client_admin"])).toBe(true);
  });

  it("a required role keeps at least one authenticator; anyone else may remove them all", () => {
    expect(mayRemoveAuthenticator(true, 1)).toBe(false);
    expect(mayRemoveAuthenticator(true, 2)).toBe(true);
    expect(mayRemoveAuthenticator(false, 1)).toBe(true);
  });

  it("turns Supabase errors into plain messages and never shows Supabase wording", () => {
    expect(twoFactorErrorMessage({ code: "mfa_verification_failed", status: 422 })).toBe(TWO_FACTOR_MESSAGES.wrongCode);
    expect(twoFactorErrorMessage({ status: 429 })).toBe(TWO_FACTOR_MESSAGES.tooManyAttempts);
    expect(twoFactorErrorMessage({ code: "insufficient_aal", status: 422 })).toBe(TWO_FACTOR_MESSAGES.codeFirst);
    expect(twoFactorErrorMessage({ code: "something_new" })).toBe(TWO_FACTOR_MESSAGES.failed);
    expect(twoFactorErrorMessage(null)).toBe(TWO_FACTOR_MESSAGES.failed);
  });

  it("every refusal code raised by 0009 has a message, and database wording never shows", () => {
    const migration = readFileSync(path.join(__dirname, "../../supabase/migrations/0009_two_factor.sql"), "utf8");
    const codes = [...migration.matchAll(/raise exception '([a-z_]+)'/g)].map((m) => m[1]);
    expect(new Set(codes).size).toBe(5);
    for (const code of new Set(codes)) expect(RESET_REFUSALS[code], code).toBeDefined();
    expect(resetRefusalMessage("reset_own_two_factor")).toMatch(/^You cannot reset your own two-factor sign-in\./);
    expect(resetRefusalMessage("permission denied for function reset_two_factor")).toBe(TWO_FACTOR_MESSAGES.failed);
    expect(resetDoneMessage("pat@example.com")).toBe(
      "Two-factor sign-in reset for pat@example.com. They will set it up again at their next sign-in.",
    );
  });

  it("before setting up, a required role may open only the setup, password and invitations pages", () => {
    for (const page of ["/account/security", "/account/password", "/invitations"]) expect(mayOpenBeforeSetup(page), page).toBe(true);
    for (const page of ["/clients", "/clients/x/people", "/brands/x", "/account/security/x", "/"]) {
      expect(mayOpenBeforeSetup(page), page).toBe(false);
    }
  });

  it("accepts a 6-digit code with spaces, and nothing else", () => {
    expect(cleanCode(" 123 456 ")).toBe("123456");
    expect(looksLikeCode("123 456")).toBe(true);
    for (const bad of ["", "12345", "1234567", "12a456"]) expect(looksLikeCode(bad), bad).toBe(false);
  });
});
