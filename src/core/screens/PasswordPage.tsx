import { StatusMessages } from "@/core/components/StatusMessages";
import { savePassword } from "./auth-actions";

/** Choose a password (T-03). People arriving from an invitation come here first. */
export default async function PasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="stack">
      <div>
        <h1>Choose a password</h1>
        <p className="lede">You will use it with your email address to sign in. It must be at least 12 characters.</p>
      </div>
      <StatusMessages error={error} />
      <form action={savePassword} className="panel grid" autoComplete="off">
        <label>
          Password
          <input type="password" name="password" autoComplete="new-password" minLength={12} required />
        </label>
        <label>
          Confirm password
          <input type="password" name="confirm" autoComplete="new-password" minLength={12} required />
        </label>
        <div className="wide">
          <button type="submit">Save password</button>
        </div>
      </form>
    </main>
  );
}
