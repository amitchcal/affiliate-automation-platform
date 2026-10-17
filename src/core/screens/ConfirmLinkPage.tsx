import { confirmLink } from "./auth-actions";

const LINK_TYPES = ["invite", "magiclink"] as const;
type LinkType = (typeof LINK_TYPES)[number];

const LINK_UNUSABLE = "This link has expired or was already used. Ask for the invitation to be sent again.";

/**
 * The page an invitation or sign-in email links to (T-03, addition (a)).
 * Opening it does nothing but show a Continue button: email scanners that
 * open links therefore cannot use up the single-use link. Only pressing
 * Continue checks the link with Supabase.
 */
export default async function ConfirmLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; error?: string }>;
}) {
  const { token_hash: tokenHash, type, error } = await searchParams;
  const usable = Boolean(tokenHash) && LINK_TYPES.includes(type as LinkType);

  return (
    <main className="shell">
      <div className="signin">
        <div>
          <h1>Continue to Affiqube</h1>
          <p className="lede">
            {type === "invite"
              ? "You have been invited to Affiqube. Press Continue; you will choose a password next."
              : "Press Continue to sign in."}
          </p>
        </div>
        {error || !usable ? (
          <>
            <p className="error" role="alert">
              {LINK_UNUSABLE}
            </p>
            <p>
              <a href="/login">Go to sign in</a>
            </p>
          </>
        ) : (
          <form action={confirmLink} className="panel">
            <input type="hidden" name="token_hash" value={tokenHash} />
            <input type="hidden" name="type" value={type} />
            <button type="submit">Continue</button>
          </form>
        )}
      </div>
    </main>
  );
}
