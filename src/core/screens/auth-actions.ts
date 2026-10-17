"use server";

import { redirect } from "next/navigation";
import { landingAfterSignIn } from "@/core/auth-landing";
import { createClient } from "@/core/supabase/server";

const MIN_PASSWORD = 12;

/**
 * Continue on /auth/confirm (T-03, addition (a)): only now is the email link
 * checked with Supabase (server-side, by its token hash). It works once.
 */
export async function confirmLink(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "");
  if (!tokenHash || (type !== "invite" && type !== "magiclink")) redirect("/auth/confirm?error=link");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: type as "invite" | "magiclink", token_hash: tokenHash });
  if (error) redirect("/auth/confirm?error=link");

  // Someone arriving from an invitation has no password yet.
  if (type === "invite") redirect("/account/password");
  redirect(await landingAfterSignIn(supabase));
}

/** Choose a password (T-03): for people who arrived from an invitation, or anyone who wants to change it. */
export async function savePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const back = (message: string): never => redirect(`/account/password?error=${encodeURIComponent(message)}`);

  if (password.length < MIN_PASSWORD) back(`Passwords must be at least ${MIN_PASSWORD} characters.`);
  if (password !== confirm) back("The two passwords do not match.");

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) back("That password was not accepted. Choose a different one of at least 12 characters.");

  redirect(`/invitations?notice=${encodeURIComponent("Password saved.")}`);
}
