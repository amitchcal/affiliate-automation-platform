import { TwoFactorCodeForm } from "@/core/components/TwoFactorCodeForm";

/** Sign-in, second step (T-05): shown after the password when two-factor sign-in is on. */
export default function TwoFactorCodePage() {
  return (
    <main className="shell">
      <div className="signin">
        <div>
          <h1>Enter your code</h1>
          <p className="lede">Enter the 6-digit code from your authenticator app.</p>
        </div>
        <TwoFactorCodeForm />
        <p className="hint">
          Lost your phone? Use your second authenticator if you added one, or ask the owner to reset two-factor sign-in
          for you.
        </p>
      </div>
    </main>
  );
}
