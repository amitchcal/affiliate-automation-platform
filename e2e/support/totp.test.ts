import { describe, expect, it } from "vitest";
import { totp } from "./totp";

// RFC 6238, appendix B: the SHA-1 key is the ASCII "12345678901234567890".
const RFC_KEY = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("totp (the tests' stand-in for an authenticator app)", () => {
  const vectors: [number, string][] = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];

  for (const [seconds, expected] of vectors) {
    it(`matches RFC 6238 at T = ${seconds}`, () => {
      expect(totp(RFC_KEY, seconds * 1000, 8)).toBe(expected);
      expect(totp(RFC_KEY, seconds * 1000)).toBe(expected.slice(2));
    });
  }

  it("changes every 30 seconds and not within a step", () => {
    expect(totp(RFC_KEY, 60_000)).toBe(totp(RFC_KEY, 89_999));
    expect(totp(RFC_KEY, 60_000)).not.toBe(totp(RFC_KEY, 90_000));
  });

  it("refuses a key that is not base32", () => {
    expect(() => totp("not a key!")).toThrow(/base32/);
  });
});
