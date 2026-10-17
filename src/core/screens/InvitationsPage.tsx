import Link from "next/link";
import { StatusMessages } from "@/core/components/StatusMessages";
import { formatDate, InvitableRole, ROLE_FOR_INVITEE, roleWithArticle } from "@/core/invitations";
import { createClient } from "@/core/supabase/server";
import { acceptInvitation, declineInvitation } from "./invitation-actions";

interface OpenInvitation {
  id: string;
  client_name: string;
  role: InvitableRole;
  expires_at: string;
}

/** The signed-in person's open invitations, to accept or decline (T-03). */
export default async function InvitationsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { notice, error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_open_invitations");
  const invitations = (data ?? []) as OpenInvitation[];

  return (
    <main className="stack">
      <div>
        <h1>Invitations</h1>
        <p className="lede">Accept an invitation to work with a client. Nothing changes until you accept.</p>
      </div>
      <StatusMessages notice={notice} error={error} />
      {invitations.length === 0 ? (
        <p className="panel empty">
          You have no open invitations. <Link href="/clients">Go to your clients</Link>.
        </p>
      ) : (
        <ul className="rows">
          {invitations.map((invitation) => (
            <li key={invitation.id}>
              <div className="split">
                <div>
                  <strong>
                    {invitation.client_name} has invited you as {roleWithArticle(invitation.role)}.
                  </strong>
                  <div className="hint">
                    {ROLE_FOR_INVITEE[invitation.role]} The invitation expires on {formatDate(invitation.expires_at)}.
                  </div>
                </div>
                <div className="actions">
                  <form action={acceptInvitation}>
                    <input type="hidden" name="invitation_id" value={invitation.id} />
                    <button type="submit">Accept</button>
                  </form>
                  <form action={declineInvitation}>
                    <input type="hidden" name="invitation_id" value={invitation.id} />
                    <button type="submit" className="quiet">
                      Decline
                    </button>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
