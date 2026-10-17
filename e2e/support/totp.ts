import { totp } from "../../scripts/totp.mjs";

/**
 * Authenticator codes for the tests, without a phone (T-05). The algorithm
 * itself (RFC 6238) is in scripts/totp.mjs, shared with the test preparation,
 * and checked against the RFC's own test vectors in totp.test.ts.
 */
export { totp };

/**
 * A code that differs from the ones already used with this key, waiting for
 * the next 30-second step if needed, as a person would wait for the app to
 * show a new code.
 */
export async function freshCode(key: string, used: string[] = []): Promise<string> {
  for (;;) {
    const code = totp(key);
    if (!used.includes(code)) {
      used.push(code);
      return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}
