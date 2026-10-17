import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusMessages } from "@/core/components/StatusMessages";
import { AppRole, formatDate, InvitableRole, ROLE_DESCRIPTIONS, ROLE_LABELS, rolesOfferedTo } from "@/core/invitations";
import { createClient } from "@/core/supabase/server";
import { inviteToClient, resetTwoFactor, sendInvitationAgain, withdrawInvitation } from "./people-actions";

interface Member {
  user_id: string;
  email: string;
  role: AppRole;
  joined_at: string;
}

interface Invitation {
  id: string;
  email: string;
  role: InvitableRole;
  invited_by: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  declined_at: string | null;
}

/** An invitation's state, in words. Expired ones may still be open in the table until a new one replaces them. */
function stateOf(invitation: Invitation, now: number): "open" | "accepted" | "declined" | "withdrawn" | "expired" {
  if (invitation.accepted_at) return "accepted";
  if (invitation.declined_at) return "declined";
  if (invitation.revoked_at) return invitation.revoked_by ? "withdrawn" : "expired";
  return new Date(invitation.expires_at).getTime() <= now ? "expired" : "open";
}

const STATE_LABELS = {
  accepted: "Accepted",
  declined: "Declined",
  withdrawn: "Withdrawn",
  expired: "Expired",
} as const;

/**
 * A client's people (T-03): members, invitations, and the invite form. For the
 * owner and that client's admins only; everyone else gets "not found", and the
 * database refuses them anyway (client_members, row-level security).
 */
export default async function PeoplePage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { clientId } = await params;
  const { notice, error } = await searchParams;
  const supabase = await createClient();

  const { data: members, error: membersError } = await supabase.rpc("client_members", { p_client: clientId });
  if (membersError) notFound();
  const [{ data: client }, { data: invitationRows }, { data: own }, { data: auth }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", clientId).maybeSingle(),
    supabase
      .from("invitations")
      .select("id, email, role, invited_by, created_at, expires_at, accepted_at, revoked_at, revoked_by, declined_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
    supabase.from("memberships").select("role, client_id"),
    supabase.auth.getUser(),
  ]);
  if (!client) notFound();

  const me = auth.user?.id;
  const myRole: AppRole | null = (own ?? []).some((row) => row.role === "owner")
    ? "owner"
    : ((own ?? []).find((row) => row.client_id === clientId)?.role as AppRole | undefined) ?? null;
  const offered = rolesOfferedTo(myRole);
  const memberList = (members ?? []) as Member[];
  const emailOf = (userId: string) =>
    userId === me ? "you" : memberList.find((member) => member.user_id === userId)?.email ?? "the owner";

  const now = Date.now();
  const invitations = (invitationRows ?? []) as Invitation[];
  const open = invitations.filter((invitation) => stateOf(invitation, now) === "open");
  const recent = invitations
    .filter((invitation) => stateOf(invitation, now) !== "open")
    .filter((invitation) => now - new Date(invitation.created_at).getTime() < 30 * 24 * 3600 * 1000);

  return (
    <main className="stack">
      <div>
        <p className="crumbs">
          <Link href="/clients">Clients</Link> / <Link href={`/clients/${client.id}`}>{client.name}</Link>
        </p>
        <h1>People</h1>
        <p className="lede">Who can work on {client.name}, and the invitations waiting to be accepted.</p>
      </div>
      <StatusMessages notice={notice} error={error} />

      <section className="stack" aria-labelledby="members">
        <h2 id="members">Members</h2>
        {memberList.length === 0 ? (
          <p className="panel empty">Nobody has joined this client yet.</p>
        ) : (
          <ul className="rows">
            {memberList.map((member) => (
              <li key={member.user_id}>
                <div className="split">
                  <div>
                    <strong>{member.email}</strong>
                    <div className="hint">
                      {ROLE_LABELS[member.role]}, joined {formatDate(member.joined_at)}
                    </div>
                  </div>
                  {myRole === "owner" && member.user_id !== me ? (
                    <form action={resetTwoFactor}>
                      <input type="hidden" name="client_id" value={client.id} />
                      <input type="hidden" name="user_id" value={member.user_id} />
                      <input type="hidden" name="email" value={member.email} />
                      <button type="submit" className="quiet">
                        Reset two-factor
                      </button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="stack" aria-labelledby="invitations">
        <h2 id="invitations">Invitations</h2>
        {open.length === 0 ? (
          <p className="panel empty">No invitations are waiting.</p>
        ) : (
          <ul className="rows">
            {open.map((invitation) => (
              <li key={invitation.id}>
                <div className="split">
                  <div>
                    <strong>{invitation.email}</strong>
                    <div className="hint">
                      {ROLE_LABELS[invitation.role]}, sent by {emailOf(invitation.invited_by)}, expires on{" "}
                      {formatDate(invitation.expires_at)}
                    </div>
                  </div>
                  <div className="actions">
                    <form action={sendInvitationAgain}>
                      <input type="hidden" name="client_id" value={client.id} />
                      <input type="hidden" name="invitation_id" value={invitation.id} />
                      <button type="submit" className="quiet">
                        Send again
                      </button>
                    </form>
                    <form action={withdrawInvitation}>
                      <input type="hidden" name="client_id" value={client.id} />
                      <input type="hidden" name="invitation_id" value={invitation.id} />
                      <button type="submit" className="quiet">
                        Withdraw
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {recent.length > 0 ? (
          <ul className="rows" aria-label="Recent invitations">
            {recent.map((invitation) => {
              const state = stateOf(invitation, now) as keyof typeof STATE_LABELS;
              return (
                <li key={invitation.id}>
                  <div className="split">
                    <span>
                      {invitation.email}, {ROLE_LABELS[invitation.role]}
                    </span>
                    <span className="status draft">{STATE_LABELS[state]}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      {offered.length > 0 ? (
        <section className="stack" aria-labelledby="invite">
          <div>
            <h2 id="invite">Invite a person</h2>
            <p className="lede">They receive an email with a link. The invitation expires after 7 days.</p>
          </div>
          <form key={notice ?? error ?? ""} action={inviteToClient} className="panel grid" autoComplete="off">
            <input type="hidden" name="client_id" value={client.id} />
            <label>
              Email
              <input type="email" name="email" required placeholder="name@example.com" />
            </label>
            <fieldset className="wide">
              <legend>Role</legend>
              <div className="stack" style={{ gap: 8 }}>
                {offered.map((role) => (
                  <label key={role} style={{ fontWeight: 400 }}>
                    <span style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--ink)", fontWeight: 600 }}>
                      <input type="radio" name="role" value={role} defaultChecked={role === "client_viewer"} required />
                      {ROLE_LABELS[role]}
                    </span>
                    <span className="hint">{ROLE_DESCRIPTIONS[role]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="wide">
              <button type="submit">Send invitation</button>
            </div>
          </form>
        </section>
      ) : null}
    </main>
  );
}
