"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState } from "react";
import { SIGNUP_MESSAGES, type SignupOutcome } from "@/modules/affiliate/site/launch";
import { signUp } from "./signup-action";

/**
 * S-08: the sign-up form, shown only where the database says sign-up works.
 * The consent box starts unticked. The wording shown is the one the database
 * returned, and its version goes with the form, so the stored record is
 * exactly what the visitor read.
 */
export function SignupForm({
  brandName,
  consentText,
  consentVersion,
  privacyHref,
}: {
  brandName: string;
  consentText: string;
  consentVersion: number;
  privacyHref: string;
}) {
  const [outcome, action] = useActionState<SignupOutcome | null, FormData>(signUp, null);
  const page = usePathname().replace(/^\/+/, "").split("/")[0] || "home";
  const message = outcome ? SIGNUP_MESSAGES[outcome] : null;
  const [before, after] = consentText.split("Privacy Policy");

  return (
    <section id="signup" className="signup" aria-labelledby="signup-heading">
      <h2 id="signup-heading">Get updates from {brandName}</h2>
      {message ? (
        <p className={outcome === "done" ? "notice" : "error"} role={outcome === "done" ? "status" : "alert"}>
          {message}
        </p>
      ) : null}
      {outcome === "done" ? null : (
        <form action={action}>
          <input type="hidden" name="page" value={page} />
          <input type="hidden" name="consent_version" value={consentVersion} />
          {/* A field people never see or fill; bots do (the honeypot). */}
          <div className="hp" aria-hidden="true">
            <label>
              Website
              <input type="text" name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          <label>
            Email
            <input type="email" name="email" required autoComplete="email" />
          </label>
          <label className="consent">
            <input type="checkbox" name="consented" value="yes" />{" "}
            <span>
              {before}
              {after !== undefined ? (
                <>
                  <Link href={privacyHref}>Privacy Policy</Link>
                  {after}
                </>
              ) : null}
            </span>
          </label>
          <button type="submit">Sign up</button>
        </form>
      )}
    </section>
  );
}
