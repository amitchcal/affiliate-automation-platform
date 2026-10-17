/**
 * Two-factor sign-in (T-05): which roles must use it, and every message a
 * person can see about it. The database (0009_two_factor.sql) enforces the
 * rule; this file words it and decides what the screens offer.
 */
import type { AppRole } from "./invitations";

/** Decided 17 October 2026 (Q1): required for these roles, optional for viewers. */
export const REQUIRED_ROLES: AppRole[] = ["owner", "operator", "client_admin"];

export function twoFactorRequired(roles: AppRole[]): boolean {
  return roles.some((role) => REQUIRED_ROLES.includes(role));
}

/**
 * Whether an authenticator may be removed. A person whose role requires
 * two-factor sign-in keeps at least one; anyone else may remove them all.
 */
export function mayRemoveAuthenticator(required: boolean, verifiedCount: number): boolean {
  return !required || verifiedCount > 1;
}

export const TWO_FACTOR_MESSAGES = {
  wrongCode: "That code is not right. Codes change every 30 seconds; enter the newest one.",
  tooManyAttempts: "Too many attempts. Wait a minute, then try again.",
  turnedOn: "Two-factor sign-in is on. Keep your authenticator app; you will need it each time you sign in.",
  added: "Second authenticator added.",
  removed: "Authenticator removed.",
  lastOneRequired:
    "Two-factor sign-in is required for your role, so your last authenticator cannot be removed. Add a new one first, then remove the old one.",
  requiredNotSetUp: "Two-factor sign-in is required for your role. Turn it on to continue.",
  codeFirst: "Enter your two-factor code first.",
  failed: "That did not work. Try again, and if it keeps happening, tell the owner.",
} as const;

/** Every refusal code raised by reset_two_factor and record_security_event (0009), with the message a person sees. */
export const RESET_REFUSALS: Record<string, string> = {
  reset_not_allowed: "Only the owner can reset two-factor sign-in.",
  reset_own_two_factor:
    "You cannot reset your own two-factor sign-in. Use your second authenticator, or the recovery steps in section 8.",
  reset_no_such_user: "That person's account was not found. Reload the page and try again.",
  security_event_not_allowed: "Sign in again, then try once more.",
  security_event_unknown: TWO_FACTOR_MESSAGES.failed,
};

/** The owner's message after a reset (T05-8). */
export function resetDoneMessage(email: string): string {
  return `Two-factor sign-in reset for ${email}. They will set it up again at their next sign-in.`;
}

/** Turns a database refusal from 0009 into the person's message. Database wording never reaches the screen. */
export function resetRefusalMessage(databaseMessage: string | undefined): string {
  return RESET_REFUSALS[(databaseMessage ?? "").trim()] ?? TWO_FACTOR_MESSAGES.failed;
}

/** The two-factor changes a person makes for themselves, as recorded in the audit log (T05-9). */
export type SecurityEvent = "two_factor_on" | "two_factor_added" | "two_factor_removed";

/**
 * The pages a person whose role requires two-factor sign-in may still open
 * before turning it on: the setup screen itself, choosing a password, and
 * their invitations. Every other page leads to the setup screen (T05-4).
 */
export const PAGES_BEFORE_SETUP = ["/account/security", "/account/password", "/invitations"];

export function mayOpenBeforeSetup(pathname: string): boolean {
  return PAGES_BEFORE_SETUP.includes(pathname);
}

/** The plain message for an error from Supabase's two-factor calls. Supabase wording never reaches the screen. */
export function twoFactorErrorMessage(error: { code?: string; status?: number } | null | undefined): string {
  if (!error) return TWO_FACTOR_MESSAGES.failed;
  if (error.status === 429 || error.code === "over_request_rate_limit") return TWO_FACTOR_MESSAGES.tooManyAttempts;
  if (error.code === "mfa_verification_failed" || error.code === "mfa_challenge_expired") return TWO_FACTOR_MESSAGES.wrongCode;
  if (error.code === "insufficient_aal") return TWO_FACTOR_MESSAGES.codeFirst;
  return TWO_FACTOR_MESSAGES.failed;
}

/** A 6-digit code, as typed: spaces removed. */
export function cleanCode(value: string): string {
  return value.replace(/\s+/g, "");
}

export function looksLikeCode(value: string): boolean {
  return /^\d{6}$/.test(cleanCode(value));
}
