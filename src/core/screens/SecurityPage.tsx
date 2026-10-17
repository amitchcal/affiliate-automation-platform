import { StatusMessages } from "@/core/components/StatusMessages";
import { TwoFactorSettings } from "@/core/components/TwoFactorSettings";
import type { AppRole } from "@/core/invitations";
import { createClient } from "@/core/supabase/server";
import { TWO_FACTOR_MESSAGES, twoFactorRequired } from "@/core/two-factor";

/**
 * Two-factor sign-in (T-05): turn it on with an authenticator app, add a
 * second one, remove one. Setting up happens in the browser, so the
 * authenticator's secret never passes through our server.
 */
export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string; required?: string }>;
}) {
  const { notice, error, required: requiredMode } = await searchParams;
  const supabase = await createClient();
  const [{ data: factors }, { data: own }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.from("memberships").select("role"),
  ]);
  const verified = (factors?.totp ?? [])
    .filter((factor) => factor.status === "verified")
    .map((factor) => ({ id: factor.id, name: factor.friendly_name ?? "Authenticator", addedAt: factor.created_at }));
  const required = twoFactorRequired(((own ?? []) as { role: AppRole }[]).map((row) => row.role));

  return (
    <main className="stack">
      <div>
        <h1>Two-factor sign-in</h1>
        <p className="lede">
          With two-factor sign-in on, signing in needs your password and a 6-digit code from an authenticator app on
          your phone, so a stolen password is not enough.
          {required ? " It is required for your role." : " It is optional for your role."}
        </p>
      </div>
      {requiredMode && verified.length === 0 ? (
        <p className="error" role="alert">
          {TWO_FACTOR_MESSAGES.requiredNotSetUp}
        </p>
      ) : null}
      <StatusMessages notice={notice} error={error} />
      <TwoFactorSettings authenticators={verified} required={required} />
    </main>
  );
}
