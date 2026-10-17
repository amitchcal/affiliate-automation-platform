import { beforeEach, describe, expect, it, vi } from "vitest";

// What the email code asks Supabase for, captured without any network call.
const calls = vi.hoisted(() => ({ otp: [] as unknown[], invite: [] as string[], inviteError: null as unknown }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      signInWithOtp: async (args: unknown) => {
        calls.otp.push(args);
        return { error: null };
      },
      admin: {
        inviteUserByEmail: async (email: string) => {
          calls.invite.push(email);
          return { error: calls.inviteError };
        },
      },
    },
  }),
}));

import { sendInvitationEmail, sendSignInLink } from "./admin";

describe("sign-in links never create accounts (T-03, S25)", () => {
  beforeEach(() => {
    calls.otp.length = 0;
    calls.invite.length = 0;
    calls.inviteError = null;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54421";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  });

  it("'Email me a sign-in link' asks Supabase with shouldCreateUser: false", async () => {
    expect(await sendSignInLink("pat@example.com")).toBe("sent");
    expect(calls.otp).toEqual([{ email: "pat@example.com", options: { shouldCreateUser: false } }]);
  });

  it("an invitation to a confirmed account falls back to a sign-in link that creates no account", async () => {
    calls.inviteError = { code: "email_exists" };
    expect(await sendInvitationEmail("pat@example.com")).toBe(true);
    expect(calls.invite).toEqual(["pat@example.com"]);
    expect(calls.otp).toEqual([{ email: "pat@example.com", options: { shouldCreateUser: false } }]);
  });
});
