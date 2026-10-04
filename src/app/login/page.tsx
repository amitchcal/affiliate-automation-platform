import { signIn } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="shell">
      <div className="signin">
        <div>
          <h1>Sign in</h1>
          <p className="lede">Use the account created for you in Supabase.</p>
        </div>
        {error ? <p className="error" role="alert">{error}</p> : null}
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
      </div>
    </main>
  );
}
