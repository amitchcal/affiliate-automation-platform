"use server";

import { redirect } from "next/navigation";
import { landingAfterSignIn } from "@/core/auth-landing";
import { isValidEmail, normaliseEmail, signInLinkMessage } from "@/core/invitations";
import { sendSignInLink } from "@/core/supabase/admin";
import { createClient } from "@/core/supabase/server";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent("That email and password did not match. Check both and try again.")}`);
  }
  redirect(await landingAfterSignIn(supabase));
}

/** "Email me a sign-in link" (T-03). Never creates an account. */
export async function emailSignInLink(formData: FormData) {
  const email = normaliseEmail(formData.get("email"));
  const back = (kind: "notice" | "error", message: string): never =>
    redirect(`/login?${kind}=${encodeURIComponent(message)}&link=1`);
  if (!isValidEmail(email)) back("error", "Enter a valid email address, for example name@example.com.");

  const result = await sendSignInLink(email);
  if (result === "rate_limited") back("error", "Too many requests. Wait a few minutes, then try again.");
  back("notice", signInLinkMessage(email));
}
