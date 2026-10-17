import { StatusMessages } from "@/core/components/StatusMessages";
import { emailSignInLink, signIn } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; link?: string }>;
}) {
  const { error, notice, link } = await searchParams;
  return (
    <main className="shell">
      <div className="signin">
        <div>
          <h1>Sign in</h1>
          <p className="lede">Use the email address you were invited with.</p>
        </div>
        <StatusMessages notice={notice} error={error} />
        <form action={signIn} className="panel">
          <label>
            Email
            <input type="email" name="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input type="password" name="password" autoComplete="current-password" required />
          </label>
          <button type="submit">Sign in</button>
        </form>
        <details className="panel" open={link === "1"}>
          <summary>Email me a sign-in link</summary>
          <p className="hint">No password needed: we email you a link that signs you in once.</p>
          <form action={emailSignInLink}>
            <label>
              Email for the link
              <input type="email" name="email" autoComplete="email" required />
            </label>
            <button type="submit" className="quiet">
              Send link
            </button>
          </form>
        </details>
      </div>
    </main>
  );
}
