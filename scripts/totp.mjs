import { createHmac } from "node:crypto";

/**
 * Authenticator codes for the tests, without a phone (T-05). This is the
 * algorithm every authenticator app uses: RFC 6238 TOTP, HMAC-SHA1, 30-second
 * steps, from the base32 key shown during setup. Checked against the RFC's own
 * test vectors in e2e/support/totp.test.ts. Used by the test preparation
 * (e2e-db.mjs) and by the tests (e2e/support/totp.ts).
 */

function base32Decode(key) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of key.replace(/[\s=]/g, "").toUpperCase()) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error(`Not a base32 key: ${key}`);
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** The code for a base32 key at a moment (milliseconds since 1970). */
export function totp(key, at = Date.now(), digits = 6) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const hash = createHmac("sha1", base32Decode(key)).update(counter).digest();
  const offset = hash[hash.length - 1] & 0xf;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, "0");
}
