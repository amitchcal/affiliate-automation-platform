"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  EMAIL_NOT_SENT,
  invitationSentMessage,
  isValidEmail,
  normaliseEmail,
  refusalMessage,
} from "@/core/invitations";
import { sendInvitationEmail } from "@/core/supabase/admin";
import { createClient } from "@/core/supabase/server";
import { resetDoneMessage, resetRefusalMessage } from "@/core/two-factor";

const peoplePath = (clientId: string) => `/clients/${clientId}/people`;

function back(clientId: string, kind: "notice" | "error", message: string): never {
  redirect(`${peoplePath(clientId)}?${kind}=${encodeURIComponent(message)}`);
}

interface SendRow {
  invitation_id: string;
  email: string;
  expires_at: string;
}

/**
 * T-03: invite a person. The database decides whether this person may invite
 * this role into this client, and records the invitation, before anything is
 * sent. The response is the same whether Supabase sends an invitation or a
 * sign-in link (addition (b)), so it never reveals who already has an account;
 * the database does not know or say which it will be.
 */
export async function inviteToClient(formData: FormData) {
  const clientId = String(formData.get("client_id") ?? "");
  const email = normaliseEmail(formData.get("email"));
  const role = formData.get("role");
  if (!isValidEmail(email)) back(clientId, "error", refusalMessage("invite_bad_email"));
  if (!role) back(clientId, "error", refusalMessage("invite_no_role"));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invitation", {
    p_client: clientId,
    p_email: email,
    p_role: String(role), // checked by the database, never trusted from the form
  });
  if (error) {
    const { data: client } = await supabase.from("clients").select("name").eq("id", clientId).maybeSingle();
    back(clientId, "error", refusalMessage(error.message, { email, client: client?.name }));
  }

  const sent = (data as SendRow[])[0];
  revalidatePath(peoplePath(clientId));
  if (!(await sendInvitationEmail(sent.email))) back(clientId, "error", EMAIL_NOT_SENT);
  back(clientId, "notice", invitationSentMessage(sent.email, sent.expires_at));
}

/** T-03: send an open invitation again. The database re-checks authority first. */
export async function sendInvitationAgain(formData: FormData) {
  const clientId = String(formData.get("client_id") ?? "");
  const id = String(formData.get("invitation_id") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resend_invitation", { p_id: id });
  if (error) back(clientId, "error", refusalMessage(error.message));

  const sent = (data as SendRow[])[0];
  revalidatePath(peoplePath(clientId));
  if (!(await sendInvitationEmail(sent.email))) back(clientId, "error", EMAIL_NOT_SENT);
  back(clientId, "notice", `Invitation sent again to ${sent.email}.`);
}

/**
 * T05-8: the owner resets a person's two-factor sign-in (a lost phone). The
 * database checks it is the owner and not their own account, removes the
 * person's authenticators, sessions and refresh tokens, and audits it.
 */
export async function resetTwoFactor(formData: FormData) {
  const clientId = String(formData.get("client_id") ?? "");
  const userId = String(formData.get("user_id") ?? "");
  const email = String(formData.get("email") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("reset_two_factor", { p_user: userId });
  if (error) back(clientId, "error", resetRefusalMessage(error.message));

  revalidatePath(peoplePath(clientId));
  back(clientId, "notice", resetDoneMessage(email));
}

/** T-03: withdraw an open invitation. */
export async function withdrawInvitation(formData: FormData) {
  const clientId = String(formData.get("client_id") ?? "");
  const id = String(formData.get("invitation_id") ?? "");
  const supabase = await createClient();
  const { data: invitation } = await supabase.from("invitations").select("email").eq("id", id).maybeSingle();
  const { error } = await supabase.rpc("revoke_invitation", { p_id: id });
  if (error) back(clientId, "error", refusalMessage(error.message));

  revalidatePath(peoplePath(clientId));
  back(clientId, "notice", `Invitation to ${invitation?.email ?? "this address"} withdrawn.`);
}
