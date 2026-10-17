"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabase } from "@/core/supabase/browser";
import {
  cleanCode,
  looksLikeCode,
  mayRemoveAuthenticator,
  type SecurityEvent,
  TWO_FACTOR_MESSAGES,
  twoFactorErrorMessage,
} from "@/core/two-factor";

interface Authenticator {
  id: string;
  name: string;
  addedAt: string;
}

interface Enrolling {
  factorId: string;
  qrCode: string;
  secret: string;
}

/**
 * Setting up and removing authenticators (T-05). Runs in the browser and talks
 * to Supabase directly: the secret shown during setup is never sent to our
 * server, never put in an address, and never stored by us.
 */
export function TwoFactorSettings({ authenticators, required }: { authenticators: Authenticator[]; required: boolean }) {
  const router = useRouter();
  const [enrolling, setEnrolling] = useState<Enrolling | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // T05-9: the change is made in Supabase; this records it in the audit log.
  const audit = (action: SecurityEvent) => createBrowserSupabase().rpc("record_security_event", { p_action: action });

  const done = (notice: string) => {
    setEnrolling(null);
    setCode("");
    router.push(`/account/security?notice=${encodeURIComponent(notice)}`);
    router.refresh();
  };

  async function start() {
    setBusy(true);
    setMessage(null);
    const supabase = createBrowserSupabase();
    // Setups that were started and never finished are cleared first.
    const { data: existing } = await supabase.auth.mfa.listFactors();
    for (const factor of existing?.all ?? []) {
      if (factor.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Authenticator added ${new Date().toISOString().slice(0, 19).replace("T", " ")}`,
    });
    setBusy(false);
    if (error || !data) return setMessage(twoFactorErrorMessage(error));
    setEnrolling({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    if (!enrolling) return;
    if (!looksLikeCode(code)) return setMessage(TWO_FACTOR_MESSAGES.wrongCode);
    setBusy(true);
    const { error } = await createBrowserSupabase().auth.mfa.challengeAndVerify({
      factorId: enrolling.factorId,
      code: cleanCode(code),
    });
    setBusy(false);
    if (error) return setMessage(twoFactorErrorMessage(error));
    await audit(authenticators.length === 0 ? "two_factor_on" : "two_factor_added");
    done(authenticators.length === 0 ? TWO_FACTOR_MESSAGES.turnedOn : TWO_FACTOR_MESSAGES.added);
  }

  async function cancel() {
    if (enrolling) await createBrowserSupabase().auth.mfa.unenroll({ factorId: enrolling.factorId });
    setEnrolling(null);
    setCode("");
    setMessage(null);
  }

  async function remove(factorId: string) {
    setMessage(null);
    if (!mayRemoveAuthenticator(required, authenticators.length)) return setMessage(TWO_FACTOR_MESSAGES.lastOneRequired);
    setBusy(true);
    const { error } = await createBrowserSupabase().auth.mfa.unenroll({ factorId });
    setBusy(false);
    if (error) return setMessage(twoFactorErrorMessage(error));
    await audit("two_factor_removed");
    done(TWO_FACTOR_MESSAGES.removed);
  }

  return (
    <section className="stack" aria-labelledby="authenticators">
      <h2 id="authenticators">Authenticators</h2>
      {message ? (
        <p key={message} className="error" role="alert">
          {message}
        </p>
      ) : null}

      {authenticators.length === 0 ? (
        <p className="panel empty">Two-factor sign-in is off.</p>
      ) : (
        <ul className="rows">
          {authenticators.map((authenticator) => (
            <li key={authenticator.id}>
              <div className="split">
                <div>
                  <strong>{authenticator.name}</strong>
                  <div className="hint">On since {new Date(authenticator.addedAt).toLocaleDateString("en-US", { dateStyle: "long" })}</div>
                </div>
                <button type="button" className="quiet" disabled={busy} onClick={() => remove(authenticator.id)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {enrolling ? (
        <form onSubmit={confirm} className="panel stack" autoComplete="off">
          <p>
            Scan this code with your authenticator app (for example Google Authenticator, Microsoft Authenticator, or a
            password manager that supports authenticator codes).
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URI from Supabase, shown once */}
          <img src={enrolling.qrCode} alt="QR code for your authenticator app" width={180} height={180} />
          <label>
            Or type this key into the app
            <input type="text" readOnly value={enrolling.secret} aria-label="Key for your authenticator app" />
          </label>
          <label>
            6-digit code from your app
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
            />
          </label>
          <div className="actions">
            <button type="submit" disabled={busy}>
              {authenticators.length === 0 ? "Turn on" : "Add authenticator"}
            </button>
            <button type="button" className="quiet" onClick={cancel}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div>
          <button type="button" disabled={busy} onClick={start}>
            {authenticators.length === 0 ? "Turn on two-factor sign-in" : "Add another authenticator"}
          </button>
          {authenticators.length === 1 ? (
            <p className="hint">
              Add a second authenticator now, for example on another phone or a password manager that supports
              authenticator codes. If you lose your only one, you will need the owner to reset it.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
