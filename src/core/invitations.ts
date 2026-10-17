/**
 * Invitations (T-03): who may invite whom, email checks, role wording, and
 * the plain-language message for every refusal code the database raises.
 *
 * The database (0008_invitations.sql) is the barrier; this file only decides
 * which roles a screen offers and how outcomes are worded, and mirrors the
 * database's rule so the two can be tested against each other.
 */

export type AppRole = "owner" | "operator" | "client_admin" | "client_viewer";
export type InvitableRole = Exclude<AppRole, "owner">;

export const INVITABLE_ROLES: InvitableRole[] = ["operator", "client_admin", "client_viewer"];

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: "Owner",
  operator: "Operator",
  client_admin: "Client admin",
  client_viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<InvitableRole, string> = {
  operator: "Works for Vividha Marketing on this client: can change settings, approve, and publish.",
  client_admin: "Can see everything for this client, approve offers, and invite people.",
  client_viewer: "Can see results and settings but cannot change anything.",
};

/** What the invited person reads about the role they are offered. */
export const ROLE_FOR_INVITEE: Record<InvitableRole, string> = {
  operator: "Operators work for Vividha Marketing on this client: they can change settings, approve, and publish.",
  client_admin: "Client admins can see everything for this client, approve offers, and invite people.",
  client_viewer: "Viewers can see results but cannot change anything.",
};

/** "a Viewer", "an Operator". */
export function roleWithArticle(role: InvitableRole): string {
  const label = ROLE_LABELS[role];
  return `${/^[AEIOU]/i.test(label) ? "an" : "a"} ${label}`;
}

export function isInvitableRole(value: unknown): value is InvitableRole {
  return INVITABLE_ROLES.includes(value as InvitableRole);
}

/**
 * The same rule as can_invite() in 0008: the owner may invite any of the three
 * roles into any client; a client admin may invite client admins and viewers
 * into their own client; nobody else may invite.
 */
export function canInvite(inviter: AppRole | null, target: AppRole, sameClient: boolean): boolean {
  if (!isInvitableRole(target)) return false;
  if (inviter === "owner") return true;
  if (inviter === "client_admin") return sameClient && (target === "client_admin" || target === "client_viewer");
  return false;
}

/** The roles a person may choose on the invite form for their own client. */
export function rolesOfferedTo(inviter: AppRole | null): InvitableRole[] {
  return INVITABLE_ROLES.filter((role) => canInvite(inviter, role, true));
}

export function normaliseEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** The same check as create_invitation(): something@something.something, no spaces. */
export function isValidEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

/** "October 24, 2026", in American English and UTC so it does not shift with the server. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

/** One message for new and existing accounts, so the form never reveals who is registered. */
export function invitationSentMessage(email: string, expiresAt: string): string {
  return `Invitation sent to ${email}. It expires on ${formatDate(expiresAt)}.`;
}

/** "Email me a sign-in link": one message whatever the address, so it never reveals who has an account (D2). */
export function signInLinkMessage(email: string): string {
  return (
    `If an Affiqube account uses ${email}, a sign-in link is on its way. It works once and expires soon. ` +
    "If you were invited and have not used your invitation yet, use the link in the invitation email, or ask for it to be sent again."
  );
}

export interface MessageContext {
  email?: string;
  client?: string;
}

/** Every refusal code raised by 0008, with the message a person sees. */
export const REFUSAL_MESSAGES: Record<string, (ctx: MessageContext) => string> = {
  invite_not_signed_in: () => "Sign in again, then try once more.",
  invite_bad_email: () => "Enter a valid email address, for example name@example.com.",
  invite_no_role: () => "Choose a role for this person.",
  invite_role_not_allowed: () =>
    "Client admins can invite other client admins and viewers. Only the owner can invite operators.",
  invite_not_allowed: () => "Your role cannot invite people. Ask a client admin.",
  invite_other_client: () => "You can invite people only to your own client.",
  invite_already_member: ({ email, client }) =>
    `${email ?? "This person"} already has access to ${client ?? "this client"}. Their role is not changed by an invitation.`,
  invite_already_open: ({ email }) =>
    `An invitation to ${email ?? "this address"} is already waiting. Withdraw it first if you want to send a new one.`,
  invite_rate_limited: () => "You have sent many invitations in the last hour. Try again later.",
  invite_resend_not_allowed: () => "You can no longer send this invitation. Ask the owner.",
  invite_not_open: () => "This invitation is no longer open.",
  invite_expired_resend: () => "This invitation has expired. Withdraw it and send a new one.",
  invite_send_limit: () => "This invitation has been sent 3 times. Withdraw it and send a new one if needed.",
  invite_revoke_not_allowed: () => "Only the owner or this client's admins can withdraw invitations.",
  invite_already_accepted: () => "This invitation has already been accepted.",
  invite_withdrawn: () => "This invitation was withdrawn by the person who sent it.",
  invite_declined: () => "You declined this invitation. Ask for a new one if you change your mind.",
  invite_expired: () => "This invitation has expired. Ask the person who invited you to send a new one.",
  invite_not_for_you: () =>
    "This invitation is not for the account you are signed in with. Sign out, then sign in with the email address the invitation was sent to.",
  invite_email_unconfirmed: () => "Confirm your email address first, using the link we sent you.",
  members_not_allowed: () => "Only the owner or this client's admins can see its people.",
};

/** Turns a database error into the person's message. Database wording never reaches the screen. */
export function refusalMessage(databaseMessage: string | undefined, ctx: MessageContext = {}): string {
  const code = (databaseMessage ?? "").trim();
  const message = REFUSAL_MESSAGES[code];
  return message ? message(ctx) : "That did not work. Try again, and if it keeps happening, tell the owner.";
}

export const EMAIL_NOT_SENT =
  "The invitation was saved, but the email could not be sent. Use Send again in a few minutes.";
