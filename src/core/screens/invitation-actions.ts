"use server";

import { redirect } from "next/navigation";
import { InvitableRole, refusalMessage, ROLE_LABELS } from "@/core/invitations";
import { createClient } from "@/core/supabase/server";

function back(kind: "notice" | "error", message: string): never {
  redirect(`/invitations?${kind}=${encodeURIComponent(message)}`);
}

/**
 * T-03: accept an invitation. The database checks that it was sent to this
 * account's confirmed email, is open and unexpired, and creates exactly the
 * membership it names; nothing about the role comes from this request.
 */
export async function acceptInvitation(formData: FormData) {
  const id = String(formData.get("invitation_id") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_id: id });
  if (error) back("error", refusalMessage(error.message));

  const accepted = (data as { client_id: string; client_name: string; role: InvitableRole }[])[0];
  redirect(
    `/clients/${accepted.client_id}?notice=${encodeURIComponent(
      `You now have access to ${accepted.client_name} as ${ROLE_LABELS[accepted.role]}.`,
    )}`,
  );
}

/** T-03: decline an invitation. Only the invited person can; nothing is created. */
export async function declineInvitation(formData: FormData) {
  const id = String(formData.get("invitation_id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("decline_invitation", { p_id: id });
  if (error) back("error", refusalMessage(error.message));
  back("notice", "Invitation declined.");
}
