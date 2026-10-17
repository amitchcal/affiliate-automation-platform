"use client";

import { useState } from "react";
import { continueAfterSecondStep } from "@/core/screens/two-factor-actions";
import { createBrowserSupabase } from "@/core/supabase/browser";
import { cleanCode, looksLikeCode, TWO_FACTOR_MESSAGES, twoFactorErrorMessage } from "@/core/two-factor";

/** The second step at sign-in (T-05): a current code from the person's authenticator app. */
export function TwoFactorCodeForm() {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!looksLikeCode(code)) return setMessage(TWO_FACTOR_MESSAGES.wrongCode);
    setBusy(true);
    const supabase = createBrowserSupabase();
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    const verified = (factors?.totp ?? []).filter((candidate) => candidate.status === "verified");
    if (listError || verified.length === 0) {
      setBusy(false);
      return setMessage(twoFactorErrorMessage(listError));
    }
    // The code may come from any of the person's authenticators (a backup phone).
    let error: Awaited<ReturnType<typeof supabase.auth.mfa.challengeAndVerify>>["error"] = null;
    for (const factor of verified) {
      ({ error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: cleanCode(code) }));
      if (!error || error.code !== "mfa_verification_failed") break;
    }
    if (error) {
      setBusy(false);
      setCode("");
      return setMessage(twoFactorErrorMessage(error));
    }
    await continueAfterSecondStep();
  }

  return (
    <form onSubmit={submit} className="panel" autoComplete="off">
      {message ? (
        <p key={message} className="error" role="alert">
          {message}
        </p>
      ) : null}
      <label>
        6-digit code
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          required
          autoFocus
        />
      </label>
      <button type="submit" disabled={busy}>
        Continue
      </button>
    </form>
  );
}
