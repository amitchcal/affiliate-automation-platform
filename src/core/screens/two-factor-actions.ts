"use server";

import { redirect } from "next/navigation";
import { landingAfterSignIn } from "@/core/auth-landing";
import { createClient } from "@/core/supabase/server";

/** After a correct code (T-05): on to open invitations, or the clients list. */
export async function continueAfterSecondStep() {
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data?.currentLevel !== "aal2") redirect("/login/two-factor");
  redirect(await landingAfterSignIn(supabase));
}
