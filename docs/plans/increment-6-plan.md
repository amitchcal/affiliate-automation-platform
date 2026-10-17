# Increment 6 plan: invitations (T-03) and two-factor sign-in (T-05)

Prepared 17 October 2026. Status: **built (steps 0–7) on 17 October 2026; see section 10. Nothing applied to the hosted project.** Earlier status: **answers Q1–Q8 approved by the owner on 17 October 2026 and his eight changes applied. Step 0 (local spike) done on 17 October 2026; findings and design changes D1–D7 recorded in section 2 and approved, with Q12 and Q13 answered yes. Additions (a) and (b) approved. Steps 1–3 approved for building; Q9–Q11 open.** No migration has been run, nothing is committed.

This increment completes Epic 1 (tenancy and access). Migration numbers start at 0008; 0007 is the Privacy Policy wording fix.

---

## 1. Goal and acceptance criteria

**Goal.** A client's team can be given access without the owner creating accounts by hand. Anyone who can approve, publish, or manage people must prove who they are with a second factor, so a stolen password is not enough.

### T-03: invitations

Story bank: "As a client admin, I want to invite my own users, so that my team can view our results." Acceptance: "Invited users receive a role limited to that client."

Each criterion below is written so a test can pass or fail on it. Section 6 lists the tests for each.

| ID | Criterion |
|---|---|
| T03-1 | The owner can invite an email address to any client as operator, client admin, or client viewer. |
| T03-2 | A client admin can invite an email address to **their own client** as client admin or client viewer, and no other role. **Operator invitations are owner-only:** a client admin's request to invite an operator is refused by the database and writes nothing, with a database test and an end-to-end test. |
| T03-3 | Operators and client viewers cannot invite anyone. |
| T03-4 | A client admin cannot invite into, see invitations of, or revoke invitations of another client. |
| T03-5 | Accepting an invitation creates exactly one membership: the client and role the invitation names, for the signed-in account whose confirmed email matches the invitation. Nothing else changes. |
| T03-6 | An invitation can be accepted once. A second attempt is refused and creates nothing. |
| T03-7 | An invitation expires 7 days after it is sent. An expired invitation cannot be accepted. |
| T03-8 | An invitation can be revoked by the owner or by an admin of its client while it is open. A revoked invitation cannot be accepted. An accepted invitation cannot be revoked (removing a member is a separate story, V-02). |
| T03-9 | An invitation can only be accepted by an account whose **confirmed** email equals the invited email (case-insensitive). Any other account is refused. |
| T03-10 | If the person already has an account, they are not given a new one. They receive a sign-in link, and the invitation waits for them on sign-in. **The inviter sees the same message whether or not the address already has an account**, so the invite form cannot be used to learn who is registered. |
| T03-11 | If the person already has access to that client, the invitation is refused when sent ("already has access"), and refused again on acceptance if the access appeared in between. Their existing role is never changed by an invitation. |
| T03-12 | The owner's email cannot be invited (the owner already has access to every client). |
| T03-13 | There is at most one open invitation per client and email. Sending another is refused until the first is revoked or has expired. |
| T03-14 | Sending, revoking, and accepting are each written to the audit log with who did it and when. No secret appears in the audit log. |
| T03-15 | The owner and the client's admins see the client's members and open invitations on a People screen. Client viewers do not see the People screen. |
| T03-16 | **Decline.** The invited person can decline an open invitation. A declined invitation cannot be accepted or revoked, creates no membership, and shows as "Declined" to the inviter. Only the invited person can decline. Declining is audited. The client can send a new invitation to the same address afterwards. |
| T03-17 | **Send again.** The owner or an admin of the client can send the email again for an open, unexpired invitation. The database re-checks that the requester may still invite that role into that client **before** the server uses the service role key. A refused request sends no email. |
| T03-18 | **Sign-in link.** The sign-in page offers "Email me a sign-in link". It sends a link only to an account whose email is **confirmed**. An invited person who has not used their invitation yet must use the invitation link or ask for it to be sent again (step 0, U10). It shows the same message whatever the address. It never creates an account. Two-factor still applies after a link sign-in. |

### T-05: two-factor sign-in

Story bank: "As the owner, I want two-factor sign-in for admin roles, so that a stolen password is not enough." Acceptance: "Owner and client admin logins require a second factor."

**Decided (Q1, 17 October 2026):** two-factor is **required** for the owner, operators, and client admins, and **optional** for client viewers. Operators are included even though the story names only the owner and client admins, because operators can approve offers, publish, and manage brands, which is more than a client admin can do. Viewers can only read; they may turn it on. **A viewer who turns it on is held to it**: from then on their password alone is not enough, in the database as well as on screen, until they remove their authenticators.

| ID | Criterion |
|---|---|
| T05-1 | Any signed-in user can turn on two-factor sign-in with an authenticator app: scan a QR code (or type the shown key), then enter a 6-digit code to confirm. |
| T05-2 | When it is on, signing in with the password alone does not give access. The person must enter a current code from the app. |
| T05-3 | A wrong or old code is refused with a plain message, and gives no access. |
| T05-4 | A person with a required role (owner, operator, client admin) who has not turned it on is taken to the setup screen after signing in, and can see and change nothing until it is on. |
| T05-5 | The rule is enforced by the database, not only the screens: a request signed in with the password alone (no second step) from a required role reads no client data and writes nothing, even if it skips the screens. |
| T05-6 | A client viewer without two-factor keeps working as today. |
| T05-7 | A person can add a second authenticator (for example a backup phone). A person with a required role cannot remove their last authenticator. |
| T05-8 | The owner can reset another person's two-factor (for a lost phone). The reset is audited. The person must set it up again at their next sign-in. |
| T05-9 | Turning two-factor on, adding, removing, and resetting are written to the audit log. |
| T05-10 | **A viewer who has a verified authenticator is held to the second step:** a password-only session of that viewer reads no client data. A viewer with no authenticator works with the password alone (T05-6). |
| T05-11 | **A password-only session can still read the person's own membership rows**, and nothing else, so the setup screen can tell whether their role requires two-factor. |
| T05-12 | **Recovery works.** After an authenticator is removed (owner reset, or the SQL fallback in section 8), the person can sign in with the password, is held on the setup screen, can set up two-factor again from that password-only session, and then works normally. |

---

## 2. What Supabase provides, and what we build

Principle: use Supabase Auth for identities, email links, and second factors; build only what Supabase has no concept of: clients, roles, and the rules between them.

| Need | Supabase provides | We build |
|---|---|---|
| Account for a new person | `auth.admin.inviteUserByEmail(email, { redirectTo })`: creates the account and sends the "Invite user" email with a single-use, expiring link. Needs the **service role key**, server side only. | A server-only admin client (`src/core/supabase/admin.ts`, `import "server-only"`) used for this one call (and the two-factor reset), only after the database has accepted the invitation. |
| Person who already has an account | `auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo } })` sends the "Magic link" email. | Choosing which of the two to send, and showing the inviter one neutral message either way. |
| "Email me a sign-in link" on the sign-in page | The same `signInWithOtp` call with `shouldCreateUser: false`, using the anon key (no service role) | The form, and one neutral message whether or not the address exists. |
| Send again | The same two calls | A database function `resend_invitation(id)` that re-checks authority first; the server calls Supabase only if it succeeds. |
| Which client and role | Nothing. | The `invitations` table, its rules, and the functions that create, revoke, and accept (migration 0008). |
| Proof the person owns the email | The link in the email (single-use, expires). After it, the session's email is confirmed (`auth.users.email_confirmed_at`). | Acceptance checks the signed-in account's confirmed email against the invitation. |
| Choosing a password after an invite | `auth.updateUser({ password })` | A "Choose a password" screen. |
| Link landing | `auth.verifyOtp({ type, token_hash })` (Supabase's recommended server-side flow) | An `/auth/confirm` route, and email templates whose links point at it. |
| Second factor | Auth MFA with TOTP: `mfa.enroll`, `mfa.challenge`, `mfa.verify`, `mfa.listFactors`, `mfa.unenroll`, `mfa.getAuthenticatorAssuranceLevel`. The session's JWT carries `aal` (`aal1` password only, `aal2` second step done). | Setup and code-entry screens, the "required for your role" rule, and its enforcement in the database (migration 0009). |
| Reset a lost factor | `auth.admin.mfa.deleteFactor` (service role); does **not** end sessions (step 0, U11) | An owner-only action on the People screen that also deletes sessions and refresh tokens. Proposed (D6, Q13): an owner-only database function doing the same deletions as the SQL fallback, with no service role. |
| Sending email | A built-in sender for testing only, heavily rate-limited (see section 7). Custom SMTP for real use. | Email templates in the repository. The SMTP account and DNS are Amit's (section 7). |
| Local testing of email | The local stack's mail catcher (Mailpit, `[local_smtp]` in `config.toml`): catches every email, delivers none. | Tests read the caught emails through its local API. |

**Dependency: real invitations need the application deployed (PL-13).** Every link in an invitation or sign-in email goes to the application's address: Supabase's Site URL and allowed redirect addresses, with `/auth/confirm`. Until the application runs at a stable public address, set in the hosted project, real invitations cannot be completed. Everything in this increment can be built and tested before that on the local stack, where links go to `http://localhost:3100`. PL-13 is not an ID in `docs/user-stories.md`; it is named here as the owner gave it, and tracked outside the repository.

**We do not store a token of our own.** The secret in each email is Supabase's link token, which Supabase makes single-use and expiring. Our invitation is bound to the email address, and accepting requires being signed in with that confirmed email. A leaked invitation id is useless to anyone who cannot sign in as that address. This meets "tokens are single-use and expire" without keeping a secret in our tables.

### Where I am not sure (to confirm in build step 0, on the local stack, before any real code)

- **U1.** What `inviteUserByEmail` returns for an email that already has an account. I expect an "already registered" error, used to switch to the sign-in-link path.
- **U2.** Whether the hosted project has **public sign-up** turned on, and whether **email confirmation** is on. This matters for security (section 4, rule 9). Only Amit can see this in the dashboard.
- **U3.** The longest an invite link can last in Supabase. I believe the email link expiry is capped at 24 hours, shorter than our 7-day invitation. Plan: if the link has expired, the invitation screen sends a fresh link for the same invitation ("Send again").
- **U4.** Whether Supabase's own auth logs keep the `redirectTo` address. Our redirect carries no secret, so this only matters for privacy, not security.
- **U5.** The exact name and API of the local mail catcher in Supabase CLI 2.121 (`[local_smtp]`, Mailpit API under `/api/v1/`).
- **U6.** Whether TOTP is switched on for the hosted project. I believe it is on by default; Amit checks in the dashboard (Authentication, Multi-Factor).
- **U7.** Whether removing a verified factor requires the session to be at `aal2`. I believe it does; the "cannot remove your last authenticator" rule is ours either way.
- **U8.** Supabase does not offer recovery codes for TOTP (as far as I know). The plan relies on a second authenticator, the owner's reset, and the SQL fallback in section 8.
- **U9.** The invite link's **real** lifetime: what Supabase actually enforces, not what the settings page says. Step 0 sets a short expiry on the local stack (for example 60 seconds), follows a link after it has passed, and records the error. The hosted value is read from the dashboard (Q9).
- **U10.** Whether `auth.users.email_confirmed_at` is set after following an **invite** link, and after following a **sign-in** link. Acceptance depends on it (T03-9). Step 0 checks both on the local stack, with email confirmation on.
- **U11.** For the SQL fallback (section 8): whether deleting a row from `auth.mfa_factors` also removes its challenges (`auth.mfa_challenges`), and whether the person's existing sessions keep `aal2` until they expire. Step 0 checks both locally.

### Step 0 findings (17 October 2026, local stack only)

Run on this project's local stack (`affiqube-e2e`, ports 54421, 54422, 54424), with temporary settings in `e2e/supabase/config.toml`:
- mail catcher on;
- TOTP on;
- public sign-up off;
- email confirmation on;
- minimum password 12;
- link expiry 60 seconds.

The settings were restored with `git restore` afterwards, and the stack was rebuilt normally. The spike scripts lived in the session's scratchpad; none was kept. The hosted project was not contacted. Supabase CLI 2.121.0, Auth as shipped with it, Mailpit v1.31.3.

| Item | Finding | Design change |
|---|---|---|
| **U1** invite an existing account | Confirmed account: `422`, `error_code: email_exists`, and no email sent. Account created by an earlier invitation but **not yet confirmed**: `200`, same account id, a new invitation email sent. | The delivery choice depends on the account's state, not only on whether it exists (see U10 and change D1). |
| **U3 / U9** link lifetime | Invite and sign-in links obey the single email-link expiry setting (`otp_expiry` locally; "Email OTP Expiration" in the dashboard). With 60 seconds set, a link worked at 30 seconds. At 75 seconds the emailed link redirected with `error=access_denied` and "Email link is invalid or has expired", and the server-side check returned `403 otp_expired`. A used link is refused the same way (`403 otp_expired`). | None to the 7-day invitation. "Send again" issues a fresh link. The hosted value is part of Q9; I believe its maximum is 24 hours, still not verified. |
| **U5** mail catcher | `[local_smtp]` in `config.toml` (the container is still named `supabase_inbucket_*`) runs **Mailpit**, web and API on port 54424 (8025 inside). API: `GET /api/v1/messages`, `GET /api/v1/message/{ID}` (Subject, Text, HTML), `DELETE /api/v1/messages`. No SMTP port needs exposing. | The e2e config enables `[local_smtp]` on 54424; the guard requires its port within 54421–54427. |
| **U7** removing a factor | A verified factor cannot be removed from an `aal1` session: `422 insufficient_aal`, "AAL2 required to unenroll verified factor". From an `aal2` session it can (`200`). (Removing an *unverified* factor was not tested.) | None. Our "last authenticator" rule is still needed, because at `aal2` Supabase allows removing the last one. |
| **U10** `email_confirmed_at` | **Set** after following an invite link (default email link and the server-side `token_hash` check alike), and after a sign-in link for an unconfirmed account. **But** with public sign-up off, Supabase **refuses to send a sign-in link to an unconfirmed account** (`422 signup_disabled`); it treats that as a sign-up. Confirmed accounts get the link (`200`, email arrives). An unknown address gets `422 otp_disabled`, no email, no account. | D1, D2, D3 below. |
| **aal claim** | Every access token carries `aal` (`aal1` after a password, `aal2` after a correct code), `amr` (the methods used, for example `password`, `totp`), and `session_id`. `auth.jwt() ->> 'aal'` reaches row-level security unchanged: a temporary policy `using ((auth.jwt() ->> 'aal') = 'aal2')` returned no rows at `aal1` and the row at `aal2`. A **new password sign-in by a user who already has a verified factor is `aal1`**, and Supabase does not restrict data for it by itself. A wrong code: `422 mfa_verification_failed`, "Invalid TOTP code entered". | Confirms the 0009 design: the database must enforce `aal2` itself. |
| **U11** deleting a factor | Its challenges are deleted with it (foreign key `on delete cascade`). **Sessions and refresh tokens are not**: after the factor was deleted, the person's 3 sessions remained, 2 of them still marked `aal2`, and **refreshing an `aal2` session still returned an `aal2` token**. After deleting the sessions and refresh tokens, refresh failed (`400 refresh_token_not_found`) and the auth API refused the old access token (`403 session_not_found`). **The data API still accepted the old access token**, because it checks only the token's signature, until the token expires (`jwt_expiry`, 3,600 seconds). Setup then worked again from a fresh password-only session (enroll `200`, verify `200`, `aal2`). | D4, D5, and your change: the fallback deletes sessions and refresh tokens. |

Other facts noticed:
- `auth.sessions` stores the signed-in user's **IP address and user agent**. These are users of the application, not visitors to brand sites, so the brand sites' Privacy Policy is not affected. It belongs in the platform's own terms later.
- The local config's comment says multi-factor is a Pro-plan feature. As far as I know that applies to phone factors, not TOTP; Q9 covers it.

### Design changes from step 0

- **D1. How each email is sent depends on the account's state.** Supabase itself decides (changed by the owner's review of 0008, 17 October 2026). The server first calls `inviteUserByEmail`:
  - no account, or an account not yet confirmed: Supabase sends the invitation (inviting again works and reuses the account);
  - a confirmed account: Supabase refuses with `email_exists` and sends nothing, and the server then sends a sign-in link instead.

  The database does **not** report whether an address has an account: `create_invitation` and `resend_invitation` return only `invitation_id`, `email`, `expires_at`, and there is no `invitation_delivery()`. The inviter sees one message either way (change 3), and the browser response is identical (addition (b)).
- **D2. "Email me a sign-in link" works only for confirmed accounts.** An invited person who has not yet followed their invitation gets nothing from it: Supabase refuses with sign-up off. They see the same neutral message, which now adds: "If you were invited and have not used your invitation yet, use the link in the invitation email, or ask for it to be sent again." T03-18 is reworded to match.
- **D3. Email templates use the server-side link check.** Supabase's default link puts the session tokens in the address fragment. Ours point to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` (and `type=magiclink`). The `/auth/confirm` route verifies on the server. This was checked: single-use, `403 otp_expired` on reuse.
- **D4. Recovery ends every session.** Required by your change and confirmed necessary by U11. The fallback SQL and the owner's Reset delete the person's factors, sessions, and refresh tokens (section 8).
- **D5. Proposed (Q12): a session check in the database.** Even with sessions deleted, an existing access token keeps working on the data API for up to an hour. Proposal: 0009 adds `session_active()`, which checks that `auth.jwt() ->> 'session_id'` still exists in `auth.sessions` (one primary-key lookup), and the four access helpers require it, so recovery and sign-out cut access at once. The alternative is to accept up to `jwt_expiry` (one hour; it could be shortened). New database tests and sabotage S27 if adopted.
- **D6. Proposed (Q13): the owner's Reset runs the same SQL as the fallback.** The reset becomes a `SECURITY DEFINER` database function, `reset_two_factor(user_id)`, for the owner only. It deletes factors, sessions, and refresh tokens and writes the audit row, instead of calling `auth.admin.mfa.deleteFactor` with the service role key. One tested code path, and one less use of the service role key. The service role key is then used only to send invitation emails.
- **D7. Settings: the email provider must stay on.** Locally, turning off `[auth.email] enable_signup` switched off **all** email sign-in, including passwords (`422 email_provider_disabled`, "Email logins are disabled"). The setting that stops public sign-up is `[auth] enable_signup = false`. In the dashboard that means: **"Allow new users to sign up" off, Email provider on.** Rule 9, Q9, and build step 2 are updated.

---

### Additions approved on 17 October 2026

**(a) `/auth/confirm` needs a button press.** Opening the link (a GET request) only shows a page: "Continue to Affiqube" with a **Continue** button. Only pressing it (a POST) checks the link with Supabase. Email security scanners that open links therefore cannot use up the single-use link. Opening the page sets no session cookie.
- **Criterion T03-19.** Opening an invitation or sign-in link without pressing Continue leaves the link unused and signs nobody in. Pressing Continue afterwards works.
- **End-to-end test.** The test first fetches the link the way a scanner would (a GET with no cookies, through the test's request client). It checks the response sets no session cookie, then opens the same link in the browser, presses Continue, and is signed in.
- **Sabotage S30.** `/auth/confirm` verifies on GET: the scanner's fetch uses up the link, and the browser then gets "This link has expired or was already used".

**(b) The invite response is identical for both delivery modes.** The response the browser receives after **Send invitation** does not depend on whether the server sent an invitation or a sign-in link (D1): same status, same redirect address, same body, same message. The only difference allowed is the email address itself.
- **Criterion T03-20.**
- **End-to-end test.** It captures the full HTTP response of the invite request for a new address and for an address with a confirmed account. With the email address replaced by a placeholder, it compares status, redirect target, and body, and requires them to be byte-for-byte equal.
- **Sabotage S31.** Any difference, for example a different message or an extra query parameter for the sign-in-link case.

---

## 3. Data changes

Both migrations are new files. No applied migration is edited. Each is safe to run twice.

### 0008_invitations.sql (T-03)

**Changes**

- Table `invitations`:
  - `id`, `client_id` (composite foreign key with the client, as in 0006);
  - `email`, stored lower-case and trimmed;
  - `role`, limited by a check to `operator`, `client_admin`, `client_viewer`. `owner` can never be invited;
  - `invited_by`, `created_at`, `expires_at` (default now + 7 days);
  - `accepted_at`, `accepted_by`, `revoked_at`, `revoked_by`, `declined_at`, `declined_by`;
  - `last_sent_at`, `send_count`, for Send again and its limit.

  Checks:
  - at most one of `accepted_at`, `revoked_at`, `declined_at` is set;
  - each `*_by` is set exactly when its `*_at` is;
  - `declined_by` and `accepted_by` can only be the invited person (enforced in the functions; the check makes the pairing structural).

  There is no token column.
- A unique partial index: one open (not accepted, revoked, or declined) invitation per client and email. Expired open invitations are marked revoked (by the system) when a new one is created for the same address.
- Row-level security on `invitations`:
  - **Read:** the owner; admins of that client; and the invited person (signed-in email equals `email`).
  - **Insert, update, delete:** no policy at all. Every change goes through the functions below.
- `SECURITY DEFINER` functions, executable by `authenticated` only, revoked from `public` and `anon`:
  - `can_invite(client_id, role)`: owner, any of the three roles; client admin of that client, `client_admin` or `client_viewer`; anyone else, false.
  - `create_invitation(client_id, email, role)` returns exactly `invitation_id`, `email`, `expires_at`. It checks `can_invite` and refuses:
    - a malformed email;
    - the owner's email;
    - an email that already has a membership in that client;
    - an email with an open invitation to that client.

    Then inserts the invitation and writes `invite` to the audit log.
  - `revoke_invitation(id)`: the owner or an admin of the invitation's client; open invitations only. Writes `revoke` to the audit log.
  - `accept_invitation(id)`:
    1. Locks the row (`for update`).
    2. Requires that it is open and not expired.
    3. Requires the caller's `auth.users.email` to equal the invited email, with `email_confirmed_at` set.
    4. Requires that the caller has no membership in that client and is not the owner.
    5. Inserts the one membership with the invitation's role, marks the invitation accepted, and writes `accept` to the audit log.

    All of this happens in one statement block, so two simultaneous accepts cannot both succeed.
  - `decline_invitation(id)`: only the invited person (confirmed email match, as for accept); open invitations only. Sets `declined_at` and `declined_by`, and writes `decline` to the audit log. Creates nothing.
  - `resend_invitation(id)` returns exactly `invitation_id`, `email`, `expires_at`:
    1. Re-checks `can_invite(client_id, role)` for the caller **now**: a client admin who has since lost the role, or the second step not done, is refused.
    2. Requires the invitation to be open and unexpired.
    3. Applies the hourly limit (counted with new invitations) and at most 3 sends per invitation.
    4. Updates `last_sent_at` and `send_count`, and writes `resend` to the audit log.

    Only when it returns a row does the server call Supabase with the service role key. The same order applies to the first send: `create_invitation` first, the service-role call after.
  - `client_members(client_id)`: email, role, and date joined of a client's members, for the owner and that client's admins. This is needed because `auth.users` is not readable directly.
- A new read policy on `memberships`: admins of a client can read that client's membership rows (today a user sees only their own).
- Each refusal raises an error with a short stable code (for example `invite_role_not_allowed`), which the screens turn into the plain wording in section 5. Codes, not database messages, reach the screen.

**Verify query** (`supabase/verify_invitations.sql`; every row should read `ok`)

| Check | ok when |
|---|---|
| table exists, row-level security on | `relrowsecurity` true |
| no insert, update or delete policy on `invitations` | 0 such policies |
| no column that could hold a secret | no column named like `%token%` or `%secret%` |
| one-open-invitation index present | the index exists and is unique and partial |
| `owner` cannot be invited | the role check excludes `owner` |
| at most one of accepted, revoked, declined | the check constraint exists |
| the ten functions exist and are `SECURITY DEFINER` (`is_client_admin`, `current_user_email`, `can_invite`, `create_invitation`, `resend_invitation`, `revoke_invitation`, `accept_invitation`, `decline_invitation`, `client_members`, `my_open_invitations`) | 10 |
| internal helpers (`invitations_sent_last_hour`, `invitation_is_open`) are not callable by signed-in users | 0 callable |
| create and send-again return only `invitation_id`, `email`, `expires_at` | both |
| no function says whether an address has an account | `invitation_delivery()` absent |
| all 12 functions of 0008 set `search_path = public, pg_temp` | 12 of 12 |
| visitors cannot call them | `anon` has no execute privilege on any |
| signed-in users can call them | `authenticated` has execute |
| admins can read their client's memberships | the new policy exists |

**Database test** (`supabase/tests/invitation_rules.sql`): the cases are listed in section 6.

**As built (step 1), beyond the list above:** two helpers the rules need, `is_client_admin(client)` and `current_user_email()`, and `my_open_invitations()`, because an invited person cannot read the clients table until they accept. Internal helpers `invitations_sent_last_hour()` and `invitation_is_open()` run only inside the functions. **Every function in 0008 sets `search_path = public, pg_temp`**, so no object a caller creates in another schema, or a temporary one, can stand in for ours. (Owner's review, 17 October 2026: the earlier `invitation_delivery()` and the `delivery` column were removed; 0008 had not been applied to any hosted project, so it was edited in place.) The rate limit counts the caller's `invite` and `resend` audit rows in the last hour. An expired open invitation is closed by the system (`revoked_at` set, `revoked_by` null) when a new one is sent to the same address.


### 0009_two_factor.sql (T-05)

**Changes**

- `mfa_required()`: true when the caller has any membership with role owner, operator, or client admin. It reads `memberships` directly (`SECURITY DEFINER`) and does not call the access helpers, so it works for a password-only session.
- `has_verified_factor()`: true when the caller has a row in `auth.mfa_factors` with `status = 'verified'`.
- `mfa_ok()`: true when **either**
  - the session's `auth.jwt() ->> 'aal'` is `aal2`, **or**
  - the caller is not a required role (`not mfa_required()`) **and** has no verified factor (`not has_verified_factor()`).

  So a viewer who has enrolled is held to `aal2` in the database, exactly like a required role.
- **Own membership rows stay readable at `aal1`.** The existing policy `memberships_read` is `user_id = auth.uid() or is_owner()`. Its first half does not use the helpers, so a password-only session still reads its own rows after 0009, and nobody else's: `is_owner()` is false at `aal1`. 0009 does not change this policy. A test proves it (T05-11). `mfa_required()` and `has_verified_factor()` are executable by `authenticated`, so the setup screen can call them at `aal1`.
- `create or replace` of the four access helpers from 0001, so that each also requires `mfa_ok()`: `is_owner()`, `has_client_access()`, `can_manage()`, `can_approve()`. **When 0009 redefines them, each gets `set search_path = public, pg_temp`**, as every function in 0008 has, and so do the new functions of 0009 (`mfa_required`, `has_verified_factor`, `mfa_ok`, `session_active`, `reset_two_factor`, `record_security_event`). `verify_two_factor.sql` gets a row checking it. Every existing row-level policy and every rule built on them then refuses a password-only session from a required role, with no other policy rewritten. The 0008 functions use the same helpers, so inviting also needs the second step.
- `reset_two_factor_allowed(user_id)`: for the owner only. The deletion itself is done by the server through `auth.admin.mfa.deleteFactor`, only after this check passes. Audited.
- An audit entry for each two-factor change, written by a small `record_security_event(action)` function the screens call after Supabase confirms the change. It only appends to `audit_log`.
- **Lockout guard.** The migration stops with a plain message if the owner account has no verified TOTP factor ("Stopped: turn on two-factor sign-in for the owner account first…"). The database test runner sets a session flag that skips this guard. The flag exists only in the test scripts.

**Verify query** (`supabase/verify_two_factor.sql`; every row should read `ok`, the last two are information)

| Check | ok when |
|---|---|
| `mfa_required`, `has_verified_factor`, and `mfa_ok` exist | 3 |
| `mfa_ok` checks verified factors (a viewer who enrolled is held to `aal2`) | its definition contains `has_verified_factor()` |
| own membership rows readable without the second step | `memberships_read` still begins `user_id = auth.uid()` |
| each of the four helpers checks `mfa_ok()` | its definition contains `mfa_ok()` |
| visitors cannot call `mfa_ok`, `mfa_required`, `record_security_event` | `anon` has no execute |
| the owner has a verified authenticator | at least 1 verified TOTP factor in `auth.mfa_factors` |
| operators and client admins without a verified authenticator (information) | lists email addresses, or "none" |
| two-factor resets in the last 30 days (information) | count |

**Database test** (`supabase/tests/two_factor_rules.sql`): cases in section 6. The test stand-in for Supabase gains:
- `auth.jwt()`, reading the `aal` claim the test sets;
- a minimal `auth.mfa_factors` table (`user_id`, `factor_type`, `status`). The five existing suites set `aal2` for owner, operator, and admin sessions, so they keep testing what they test today. This is a change to test files only.

**Rollout order (to avoid locking the owner out)**

1. Deploy the screens.
2. Apply 0008.
3. Turn on two-factor for the owner account, with two devices.
4. Run `verify_two_factor.sql` and check the owner row reads `ok`.
5. Apply 0009.

The migration's guard enforces step 3.

---

## 4. Security and access rules

1. **Who may invite whom.** All of this is enforced in `can_invite`, in the database:

   | Inviter | May invite | Into |
   |---|---|---|
   | Owner | operator, client admin, client viewer | any client |
   | Client admin | client admin, client viewer | their own client only |
   | Operator | nobody (decided, Q2) | — |
   | Client viewer | nobody | — |

   **Operator invitations are owner-only (Q7).** Database test: a client admin's `create_invitation(own client, …, 'operator')` is refused and no row is written. End-to-end test: the client admin's role list has no Operator, and a crafted request for one is refused with its message.

2. **No other client.** Every function checks the client named on the invitation, not one passed in from the screen. A client admin of A calling `create_invitation` for client B is refused and nothing is written. They cannot read B's invitations or members: row-level security returns no rows.
3. **No raise above the named role.** Acceptance inserts exactly the invitation's stored role and client. It never takes a role from the request. The role check makes `owner` impossible. An existing membership is never changed: if one appears, acceptance is refused.
4. **Single use and expiry.** The invitation can be accepted once: the row is locked, and `accepted_at` must be null. It expires after 7 days (`expires_at` checked on accept). It can be revoked. The email link is Supabase's: single-use, and expiring within Supabase's limit (U3).
5. **Nothing secret stored or logged in plain text.**
   - We store no token. The service role key lives only in a server environment variable (Vercel; `SUPABASE_SERVICE_ROLE_KEY`, never `NEXT_PUBLIC_`). It is never committed, never written by the test scripts, and never pasted into chat.
   - The test build is scanned to prove the key is not in any browser file (section 6).
   - Server code never logs email links, codes, or keys. Audit entries record who, what, which client, and which email, but no link and no code.
   - TOTP secrets stay in Supabase's `auth` schema. Our screens show the secret once, during setup, and never store it.
6. **Email binding.** Acceptance needs the confirmed email of the signed-in account to match. An invitation id alone grants nothing.
7. **Existing account.** No second account is created. That person gets a sign-in link. After signing in, they see the invitation on an "Invitations" screen and choose Accept or Decline. Nothing is granted until they accept.

   **Neutral messages.** The invite form shows one message for new and existing accounts, and so does "Email me a sign-in link". Neither reveals whether an address is registered. The "already has access to this client" refusal remains: the inviter can already see the client's members on the People screen. It now uses the same wording for the owner's address as for members, so it no longer singles out the owner.
   **Send again re-checks authority.** `resend_invitation` repeats every check `create_invitation` makes against the current caller, before the server touches the service role key. A refusal sends no email.

   **Own memberships without the second step.** A password-only session can read its own membership rows, and nothing else, so the setup screen can say whether two-factor is required for this person (T05-11).
8. **Two-factor in the database.** A password-only session (`aal1`) gets no data and no writes, through the helpers above, when the person has a required role **or** has a verified authenticator (including a viewer who enrolled). Middleware redirects to the code or setup screen, but it is not the barrier.
9. **Sign-up must not be open to the public on the hosted project** (U2). If anyone could sign up with an address they do not own and be confirmed at once, they could accept an invitation sent to that address. Required setting:
   - public sign-up **off** ("Allow new users to sign up"; `[auth] enable_signup = false`). Accounts come only from invitations;
   - the **Email provider on**. Switching the provider off also stops password sign-in (step 0, D7);
   - email confirmation **on**.

   Amit checks this in the dashboard. The local test stack mirrors it (`enable_signup = false`), and a test proves public sign-up is refused.
10. **Rate.** Supabase rate-limits emails and code attempts. We add a limit of 20 invitations per inviter per hour in `create_invitation`, so a compromised admin account cannot send floods of email (decided, Q5). Send again counts toward it, and an invitation can be sent at most 3 times.
11. **Audit.** `invite`, `resend`, `revoke`, `accept`, `decline`, `two_factor_on`, `two_factor_added`, `two_factor_removed`, and `two_factor_reset` go to `audit_log` with the client where there is one. The audit log stays append-only.

---

## 5. Screens and wording

All wording in plain American English. Role names are shown as "Operator", "Client admin", "Viewer", each with one line on what it allows.

| Screen | Who | What it shows |
|---|---|---|
| **People** (`/clients/<id>/people`, a link on the client page) | Owner; that client's admins | Members (email, role, joined). Open invitations (email, role, sent by, expires on, **Send again**, **Withdraw**). Recently declined, withdrawn and expired invitations, marked as such. Form **Invite a person**: Email, Role (only the roles this person may give), **Send invitation**. Owner only: **Reset two-factor** next to each member. |
| **Invitations** (`/invitations`) | Anyone signed in with open invitations | "Vividha Marketing has invited you as a Viewer. Viewers can see results but cannot change anything." **Accept** / **Decline** (kept: see T03-16 and `declined_at` in 0008). After sign-in, a person with open invitations is brought here first. |
| **Sign in** (`/login`, changed) | Everyone | Existing email and password form, plus a link **Email me a sign-in link** that shows an Email field and **Send link**. |
| **Choose a password** (`/account/password`) | New person arriving from an invitation | Password, confirm password, **Save password**. |
| **Two-factor sign-in** (`/account/security`) | Everyone | Status. **Turn on two-factor sign-in**: QR code, the key as text, code field, **Turn on**. **Add another authenticator**. **Remove** (refused for the last one of a required role). |
| **Enter your code** (`/login/two-factor`) | After the password, when two-factor is on | "Enter the 6-digit code from your authenticator app." **Continue**. |
| **Set up required** (the security screen, in required mode) | Owner, operator, client admin without two-factor | "Two-factor sign-in is required for your role. Turn it on to continue." Nothing else is reachable. |

Role lines on the invite form:

- **Operator:** "Works for Vividha Marketing on this client: can change settings, approve, and publish."
- **Client admin:** "Can see everything for this client, approve offers, and invite people."
- **Viewer:** "Can see results and settings but cannot change anything."

**Every message a person can see**

Invite form:

| Situation | Message |
|---|---|
| Sent (new or existing account: **one message**, so the form does not reveal who is registered) | "Invitation sent to {email}. It expires on {date}." |
| Bad email | "Enter a valid email address, for example name@example.com." |
| No role chosen | "Choose a role for this person." |
| Role not allowed (client admin choosing Operator, by a crafted request) | "Client admins can invite other client admins and viewers. Only the owner can invite operators." |
| Viewer or operator tries | "Your role cannot invite people. Ask a client admin." |
| Another client | "You can invite people only to your own client." |
| Already a member, or the owner's address (same wording for both) | "{email} already has access to {client}. Their role is not changed by an invitation." |
| Open invitation exists | "An invitation to {email} is already waiting. Withdraw it first if you want to send a new one." |
| Too many | "You have sent many invitations in the last hour. Try again later." |
| Email could not be sent | "The invitation was saved, but the email could not be sent. Use Send again in a few minutes." |
| Second step not done (crafted request) | "Enter your two-factor code first." |

Send again:

| Situation | Message |
|---|---|
| Done | "Invitation sent again to {email}." |
| No longer allowed to invite this role or client | "You can no longer send this invitation. Ask the owner." |
| Not open (accepted, declined, withdrawn) | "This invitation is no longer open." |
| Expired | "This invitation has expired. Withdraw it and send a new one." |
| Sent 3 times already | "This invitation has been sent 3 times. Withdraw it and send a new one if needed." |
| Too many in the last hour | "You have sent many invitations in the last hour. Try again later." |

"Email me a sign-in link" (sign-in page):

| Situation | Message |
|---|---|
| Any address, registered or not (**one message**) | "If an Affiqube account uses {email}, a sign-in link is on its way. It works once and expires soon. If you were invited and have not used your invitation yet, use the link in the invitation email, or ask for it to be sent again." |
| Bad email | "Enter a valid email address, for example name@example.com." |
| Supabase rate limit | "Too many requests. Wait a few minutes, then try again." |

Withdraw:

| Situation | Message |
|---|---|
| Done | "Invitation to {email} withdrawn." |
| Already accepted | "This invitation was already accepted, so it cannot be withdrawn." |
| Already withdrawn or expired | "This invitation is no longer open." |
| Not allowed | "Only the owner or this client's admins can withdraw invitations." |

Accept or decline:

| Situation | Message |
|---|---|
| Accepted | "You now have access to {client} as {role}." |
| Declined | "Invitation declined." |
| Expired | "This invitation has expired. Ask the person who invited you to send a new one." |
| Withdrawn | "This invitation was withdrawn by the person who sent it." |
| Already declined | "You declined this invitation. Ask for a new one if you change your mind." |
| Already accepted | "This invitation has already been accepted." |
| Different account | "This invitation is not for the account you are signed in with. Sign out, then sign in with the email address the invitation was sent to." |
| Already has access | "You already have access to {client}." |
| Email not confirmed | "Confirm your email address first, using the link we sent you." |
| Email link expired or used | "This link has expired or was already used. Ask for the invitation to be sent again." |

Password screen: "Passwords must be at least 12 characters." (decided, Q6) / "The two passwords do not match." / "Password saved."

Two-factor:

| Situation | Message |
|---|---|
| Wrong code | "That code is not right. Codes change every 30 seconds; enter the newest one." |
| Too many attempts | "Too many attempts. Wait a minute, then try again." |
| Turned on | "Two-factor sign-in is on. Keep your authenticator app; you will need it each time you sign in." |
| Added | "Second authenticator added." |
| Removed | "Authenticator removed." |
| Last one, required role | "Two-factor sign-in is required for your role, so your last authenticator cannot be removed. Add a new one first, then remove the old one." |
| Required, not set up | "Two-factor sign-in is required for your role. Turn it on to continue." |
| Reset done (owner) | "Two-factor sign-in reset for {email}. They will set it up again at their next sign-in." |
| Reset not allowed | "Only the owner can reset two-factor sign-in." |

---

## 6. Tests

### Unit (Vitest)

- `canInvite(inviterRole, targetRole, sameClient)`: the full matrix (4 roles × 3 roles × same or other client), mirroring the database rule. The screen uses it to choose which roles to offer; the database stays the barrier.
- Email normalisation and validation: trims, lower-cases, rejects malformed addresses.
- The mapping from each refusal code to its message in section 5 (every code has a message; no database text reaches the screen).
- TOTP code generator used by the tests (`e2e/support/totp.ts`), against the RFC 6238 test vectors.
- Guard additions (section 7):
  - the mail catcher's port must be in 54421–54427;
  - no `[auth.email.smtp]` may be enabled in `e2e/supabase/config.toml`;
  - the service role key is passed to the test application only when the address is the local stack.

### Database (`supabase/tests/invitation_rules.sql`, `two_factor_rules.sql`)

Invitations:
- every row of the who-may-invite matrix, allowed and refused;
- a client admin of A on client B: create, read, revoke all refused;
- **operator invitations are owner-only:** a client admin inviting `operator` into their own client is refused, with no row written; the owner succeeds;
- the invitee reads only their own invitations;
- decline: only the invited person can decline; a declined invitation cannot be accepted or revoked; it creates no membership; a new invitation to the same address is then allowed;
- Send again: allowed for the owner and the client's admins on an open invitation; refused for a viewer, an operator, another client's admin, a client admin whose membership was removed since sending, an expired or closed invitation, and a 4th send; each refusal changes nothing (`send_count` unchanged, no audit row);
- accept creates exactly one membership with the named role;
- second accept refused;
- expired refused;
- revoked refused;
- different email refused;
- unconfirmed email refused;
- already a member refused;
- owner email refused;
- one open invitation per client and email;
- no direct insert, update, or delete;
- audit rows written, with no secret in them;
- `anon` can call nothing.

Two-factor:
- required roles at `aal1`: no rows from clients, brands, offers, and so on; no writes; cannot invite;
- the same at `aal2`: works;
- viewer at `aal1` **with no verified factor:** works as today;
- viewer at `aal1` **with a verified factor:** no rows, no writes (held to `aal2`); the same viewer at `aal2`: works;
- a required role at `aal1` reads **its own membership rows** and no others; `mfa_required()` and `has_verified_factor()` answer correctly at `aal1`;
- after the factor rows are deleted (the SQL fallback in section 8), the person at `aal1` gets no data if their role is required, and is not blocked by a stale factor;
- `mfa_required` for each role;
- the lockout guard stops 0009 without an owner factor (when the test flag is not set).

### End-to-end (Playwright, local stack only)

- `invitations.spec.ts`:
  1. The owner invites a new email as a viewer. The email is read from the local mail catcher, and its link goes to `localhost:3100`. Following it, choosing a password, and accepting gives exactly viewer access to that client.
  2. A client admin invites into their own client. Their role list has no Operator, and a crafted operator request is refused with its message.
  3. An existing account gets a sign-in link and sees the invitation. **The inviter's message is character for character the one shown for a new address.**
  3a. Decline: the invitee declines; the People screen shows "Declined"; accepting afterwards is refused.
  3b. Send again: a second email arrives in the mail catcher. A viewer's crafted Send again request is refused, and **no new email arrives** (catcher count unchanged).
  3c. "Email me a sign-in link": for an invited address, a link arrives and signs in. For an unknown address, the same message is shown, no email arrives, and no account is created.
  4. Expired: the date is set in the database by the test. Then withdrawn, used twice, and wrong account, each shown with its message.
  5. A viewer sees no People screen.
  6. The second client's admin cannot see or act on Vividha's people.
  7. Public sign-up is refused.
- `two-factor.spec.ts`:
  1. Turning it on from the security screen.
  2. Sign-in then asks for the code; a wrong code is refused; the right code gives access.
  3. A required role without two-factor is held on the setup screen.
  4. A password-only session calling the database directly gets no data.
  5. The last authenticator cannot be removed.
  6. The owner reset works and is audited.
  7. A viewer who turns it on is then asked for the code at sign-in, and a direct password-only database request from that viewer gets no data.
  8. **Recovery (section 8):**
     1. A client admin with two-factor on is signed in at `aal2` in one browser context, with its refresh token kept by the test.
     2. The test runs the repository's fallback SQL (`supabase/recovery/remove_two_factor.sql`, with the address filled in) against the local database.
     3. It checks the returned counts: factors, sessions, and refresh tokens are all above 0.
     4. The old browser context is sent to sign-in on its next page.
     5. The old refresh token is refused (`refresh_token_not_found`).
     6. With D5, the old access token gets no data from the data API.
     7. In a new context the person signs in with the password alone and is held on the setup screen, which can tell from their own membership that it is required.
     8. They set up two-factor again from that password-only session, enter a code, and work normally.
- **Existing specs:** the test users for owner and client admin get a TOTP factor at preparation time (`e2e-db.mjs`, through the local API). The per-run secret goes into `e2e/.run/run.json`, which git ignores, like the passwords. `signIn()` completes the second step, so all 25 existing tests keep running under enforcement.
- **No phone needed.** The test computes the 6-digit code from the TOTP secret with the RFC 6238 algorithm, exactly what an authenticator app does. The secret comes from the setup screen's "type this key" text, or from the enrollment response at preparation.

  **What the end-to-end tests do not prove:**
  - a real phone app scans our QR code correctly;
  - a phone with a wrong clock;
  - real email delivery, spam folders, or the hosted email templates;
  - the hosted project's settings (sign-up off, TOTP on, SMTP, redirect addresses);
  - a real lost-phone recovery.

  These are Amit's manual checks after deployment, listed in the handover.

### Sabotage cases (each must turn red, then be reverted)

| # | Change | Test that must fail | Proves |
|---|---|---|---|
| S1 | `can_invite` lets a client admin give `operator` | DB matrix; e2e role list | Admins cannot raise anyone above their own level |
| S2 | `create_invitation` skips the same-client check | DB; e2e second client | No inviting into another client |
| S3 | `accept_invitation` takes the role from an argument | DB "exactly the named role" | Acceptance cannot raise the role |
| S4 | `accept_invitation` ignores `accepted_at` | DB second accept; e2e used twice | Single use |
| S5 | `accept_invitation` ignores `expires_at` | DB expired; e2e expired | Expiry |
| S6 | `accept_invitation` ignores `revoked_at` | DB revoked | Revoke works |
| S7 | `accept_invitation` skips the email match | DB different email; e2e wrong account | An invitation id alone grants nothing |
| S8 | `accept_invitation` skips `email_confirmed_at` | DB unconfirmed | Confirmed email required |
| S9 | An insert policy on `invitations` for `authenticated` | DB direct insert | All changes go through the checked functions |
| S10 | Invitations readable by any client member | DB, e2e viewer | Viewers and other clients cannot see invitations |
| S11 | `mfa_ok()` returns true | DB `aal1`; e2e direct request | Two-factor enforced in the database |
| S12 | Middleware stops redirecting to the code screen | e2e sign-in without code | The screens ask for the code (UI layer) |
| S13 | Viewer marked as required | DB, e2e viewer at `aal1` | Viewers are not locked out |
| S14 | Last-authenticator check removed | e2e remove last | Admins cannot remove their only factor |
| S15 | `NEXT_PUBLIC_` prefix on the service role key | build scan | The service key never reaches the browser |
| S16 | `config.toml` points mail at a real SMTP host | guard unit test | Tests never send real email |
| S17 | `enable_signup = true` locally | e2e public sign-up | The sign-up setting the security depends on is tested |
| S18 | 0009 lockout guard removed | DB guard test | The owner cannot be locked out by applying 0009 too early |
| S19 | `mfa_ok()` ignores verified factors (`not mfa_required()` alone) | DB viewer-with-factor at `aal1`; e2e test 7 | A viewer who enrolled is held to `aal2` |
| S20 | `resend_invitation` skips `can_invite` | DB Send again refusals; e2e 3b (no new email) | Send again cannot be used without authority, and no email is sent on refusal |
| S21 | The server calls the service role before `resend_invitation` (order swapped) | e2e 3b (an email arrives for the refused request) | Authority is checked before the service role key is used |
| S22 | The invite form shows a different message for existing accounts | e2e 3 (messages differ) | The form does not reveal who is registered |
| S23 | `memberships_read` changed to `is_owner()` only | DB own rows at `aal1`; e2e recovery test (setup screen cannot tell the role) | Password-only sessions can read their own memberships |
| S24 | `decline_invitation` lets anyone decline | DB decline by another account | Only the invited person can decline |
| S25 | The sign-in link option creates accounts (`shouldCreateUser: true`) | e2e 3c (account appears for an unknown address) | The sign-in link never creates accounts |
| S26 | The fallback SQL (or the owner's Reset) skips deleting sessions and refresh tokens | e2e test 8, steps 4–5 (old refresh token still works) | Recovery signs the person out everywhere |
| S27 | (If D5 is adopted) `session_active()` returns true | DB test with a deleted session; e2e test 8, step 6 | A removed session loses data access at once |
| S28 | `create_invitation` (or `resend_invitation`) returns a fourth column again, such as `delivery` | DB test "return exactly invitation_id, email, expires_at"; `verify_invitations.sql` row | The database never tells the server, and so never the browser, whether an address has an account. **Run 17 October 2026: red** ("returns {invitation_id,email,expires_at,delivery}"), 0008 restored byte for byte. |

---

## 7. Email

**Today:** no email is sent by the application. The hosted project would use Supabase's built-in sender. It is meant for trying things out: it is limited to a few emails an hour and, as I understand it, sends only to addresses of the Supabase organisation's team members. It cannot send invitations to clients.

**Needed for real invitations (Amit's parts are marked):**

| Item | What | Who |
|---|---|---|
| Provider | **Resend** (decided, Q3; free tier about 3,000 emails a month, 100 a day). **No account is opened until Amit says so.** | **Amit** creates the account, when he decides |
| Sender | `Affiqube <no-reply@affiqube.com>` (decided, Q4). **Reply-to address: to follow from Amit.** Until then the templates carry no reply-to. | **Amit** gives the reply-to address |
| DNS on affiqube.com | SPF (TXT), DKIM (the provider's records), DMARC (TXT at `_dmarc`, start with `p=none`), and any return-path record the provider asks for | **Amit**, at the domain's DNS host |
| Connect to Supabase | Dashboard, Authentication, SMTP settings: host, port, user, password from the provider. Never in the repository, never in chat. | **Amit** |
| Email templates | "Invite user" and "Magic link" texts, kept in the repository (`supabase/email-templates/`, no secrets); links point at `/auth/confirm` | Built here; **Amit** pastes them into the dashboard |
| Addresses | Site URL and allowed redirect addresses for the deployed application. **Depends on PL-13:** until the app is deployed at a stable address, real invitation links have nowhere to go. | **Amit**, in the dashboard, after PL-13 |
| Sign-up and confirmation | Public sign-up off, email confirmation on (U2, rule 9) | **Amit** checks |
| Service role key | Vercel environment variable `SUPABASE_SERVICE_ROLE_KEY` (server only) | **Amit** adds it in Vercel; never shared in chat |

**Tests never send real email.** The local stack's mail catcher receives every email the local Supabase sends. Nothing leaves the machine.
- `e2e/supabase/config.toml` has no `[auth.email.smtp]` section, and a guard test fails if one is enabled.
- The application under test has no SMTP setting at all: only the local Supabase sends mail, into the catcher.
- The tests read messages from the catcher's local API on `127.0.0.1:54424`, inside the allowed port range.

**Tests never touch the hosted project.** The existing guard stays: only `http://127.0.0.1:54421` is accepted, and the build is scanned for the hosted project's address. The local service role key is read from `supabase status` at run time, kept in memory, and passed only to the local test application. The guard refuses to pass it with any other address. Ports 54321 and 54322 (interior-ai) remain refused.

---

## 8. Recovery when an authenticator is lost

**Prevention, shown on the setup screen.** "Add a second authenticator now, for example on another phone or a password manager that supports authenticator codes. If you lose your only one, you will need the owner to reset it." The setup screen also shows the key as text once, so it can be stored safely offline.

### A client admin or operator loses it

1. They tell the owner by another channel. The owner checks it is really them.
2. The owner opens the client's People screen and chooses **Reset two-factor** next to that person (T05-8). This removes the person's factors, **sessions, and refresh tokens**, so they are signed out everywhere, and writes the audit row. As proposed in D6 (Q13), it runs as the owner-only database function `reset_two_factor(user_id)`, which does exactly what the SQL fallback does. Otherwise it is the server's admin call plus the session deletion.
3. The person signs in with their password. They are held on the setup screen ("Two-factor sign-in is required for your role. Turn it on to continue."), set it up again, and enter a code. They then work normally.

If the owner cannot reach the screen, the owner uses the SQL fallback below with that person's address.

### The owner loses it

1. **First choice:** sign in with the second authenticator, then remove the lost one and add a new one on the security screen.
2. **If there is no second authenticator**, use the SQL fallback. Signing in to the Supabase dashboard is protected by the Supabase account's own sign-in (which should itself have two-factor on; Amit's task).
3. Sign in to the application with the password. You are held on the setup screen; set up two-factor again, on **two** devices.
4. Run `supabase/verify_two_factor.sql`. The row "the owner has a verified authenticator" must read `ok`.

### SQL fallback (`supabase/recovery/remove_two_factor.sql`, run in the Supabase SQL editor)

It removes the person's authenticators **and signs them out everywhere**: it deletes their sessions and refresh tokens as well. This is the owner's requirement, and step 0 (U11) showed it is necessary: deleting a factor alone left sessions at `aal2`, and they could still be refreshed at `aal2`.

The file will contain, with one address to fill in:

```sql
-- Removes every authenticator of one account and signs it out everywhere,
-- so it must sign in again and set two-factor up again.
-- Replace the address below, run, and check the result. Use only after
-- confirming the person's identity by another channel.
with target as (
  select id from auth.users where email = lower('PUT-THE-EMAIL-HERE')
),
removed_factors as (          -- their challenges go with them (on delete cascade)
  delete from auth.mfa_factors f using target t
  where f.user_id = t.id
  returning f.id
),
removed_sessions as (         -- also removes their amr claims (on delete cascade)
  delete from auth.sessions s using target t
  where s.user_id = t.id
  returning s.id
),
removed_tokens as (           -- refresh tokens; user_id is text in auth.refresh_tokens
  delete from auth.refresh_tokens r using target t
  where r.user_id = t.id::text
  returning r.id
)
insert into public.audit_log (actor_type, action, entity, entity_id, after)
select 'user', 'two_factor_reset_by_sql', 'auth.users', t.id::text,
       jsonb_build_object(
         'factors_removed',        (select count(*) from removed_factors),
         'sessions_removed',       (select count(*) from removed_sessions),
         'refresh_tokens_removed', (select count(*) from removed_tokens))
from target t
returning entity_id as user_id, after;
```

- One row is returned for a matching account, with the three counts. No row means the address matched no account, and nothing changed.
- The audit entry records that a reset happened and what was removed, never a secret.
- **What it cannot do on its own (U11):** an access token issued before the reset still works on the data API until it expires (up to `jwt_expiry`, 3,600 seconds). The auth API refuses it at once (`session_not_found`), and it can no longer be refreshed. If D5 (Q12) is adopted, the database refuses it at once as well.
- The owner's **Reset two-factor** on the People screen does the same three deletions and the same audit entry (D6, Q13). The SQL file is the fallback when the screen cannot be used.

### Local test of recovery

End-to-end test 8 in section 6 and the database tests prove:
- the fallback SQL in the repository removes the person's factors, **sessions, and refresh tokens**, and writes one audit row with the counts;
- **every earlier session is signed out:**
  - a browser signed in before the reset is sent to sign-in on its next page (the auth API refuses its session);
  - its refresh token is refused;
  - if D5 is adopted, a direct data request with its old access token gets no rows;
- the person can then sign in with the password alone and is held on the setup screen (their own membership shows the role requires it);
- setup works again from that password-only session, and normal work resumes after the new code.

The test runs the repository file itself, with only the address substituted, against the local test database. The hosted project is never touched.

## 9. Risks, open questions, and build order

### Risks

| Risk | Mitigation |
|---|---|
| The owner is locked out after 0009 | Rollout order in section 3. The migration refuses without a verified owner factor. Two authenticators advised. Last resort: the SQL fallback in section 8, tested locally. |
| Real invitations cannot be completed before deployment | Dependency PL-13 (section 2). Everything is built and tested locally first. |
| Public sign-up open on the hosted project, letting someone claim an invitation for an address they do not own | Rule 9; Amit checks it; the local stack mirrors it; sabotage S17 |
| Email lands in spam or is not sent | Proper SPF, DKIM, and DMARC; "Send again"; the invitation is saved even if email fails |
| The service role key leaks | Server-only module, build scan for browser files, no `NEXT_PUBLIC_`; used for two calls only, after the database has authorised them |
| Changing the four access helpers breaks existing behaviour | All five existing database suites and all 25 end-to-end tests run under enforcement, with `aal2` sessions |
| Supabase's link expiry (U3) is shorter than our 7 days | "Send again" issues a fresh link for the same invitation |
| A lost phone for a client admin | Second authenticator; owner reset (T05-8) |

### Decisions (17 October 2026)

| Q | Decision |
|---|---|
| Q1 | Two-factor required for owner, operator, client admin; optional for viewers. A viewer who enrolls is held to it (change 1). |
| Q2 | Only the owner and client admins invite; operators do not. |
| Q3 | Resend. No account opened until Amit says so. |
| Q4 | Sender `no-reply@affiqube.com`; reply-to address to follow. |
| Q5 | 7-day expiry; 20 invitations per inviter per hour (Send again counts). |
| Q6 | Minimum password length 12 characters; the local stack and the hosted project are both set to 12. |
| Q7 | A client admin may invite client admins and viewers only; operator invitations are owner-only, with a test. |
| Q8 | Removing a member or changing a role stays owner-only, by SQL, until V-02. |
| Decline | **Kept**, with `declined_at` and `declined_by`, checks, criterion T03-16, tests, and sabotage S24. |

### Still open

- **Q9 (Amit, pending).** In the Supabase dashboard under Authentication:
  - Is public sign-up ("Allow new users to sign up") on? It should be **off**, with the **Email provider left on** (D7).
  - Is email confirmation on?
  - Is TOTP on?
  - What is the email link ("Email OTP") expiry?
  - Is the minimum password length 12?
- **Q10 (Amit).** The reply-to address for invitation and sign-in emails.
- **Q11 (Amit).** When PL-13 (deployment at a stable address) will be done. Real invitations wait for it; building does not.
- **Q12 (D5): yes** (17 October 2026). 0009 adds `session_active()` to the four access helpers.
- **Q13 (D6): yes** (17 October 2026), with two conditions: `reset_two_factor(user_id)` **refuses to reset the caller's own factors** (refusal `reset_own_two_factor`, message "You cannot reset your own two-factor sign-in. Use your second authenticator, or the recovery steps in section 8."), and it **writes its audit entry in the same transaction** as the deletions, so a reset without an audit row cannot happen. Database tests and sabotage cases S29 (audit written outside the transaction, or skipped) and S32 (own reset allowed) are added for step 6. S32 was S28 until the owner assigned S28 to the returned-columns case on 17 October 2026.

### Build order (small steps; each ends with its tests passing)

| Step | Content | Must pass |
|---|---|---|
| 0 | **Done 17 October 2026; findings in section 2.** Spike on the local stack only, nothing kept. Check:<br>• U1, U5, U7;<br>• the `aal` claim in row-level security;<br>• **U9:** the invite link's real lifetime, with a short local expiry and a link followed after it;<br>• **U10:** whether `email_confirmed_at` is set after following an invite link and after a sign-in link;<br>• **U11:** what deleting a factor does to challenges and sessions.<br>Record the results in this plan, and update section 8 if U11 requires it. | — |
| 1 | **Built 17 October 2026.** 0008, `invitation_rules.sql`, `verify_invitations.sql`; test stand-in `auth.jwt()` | `npm run test:db` |
| 2 | **Built 17 October 2026.** Server-only admin client; guard and build-scan additions; mail catcher (`[local_smtp]`) on in `e2e/supabase/config.toml`, TOTP on, public sign-up off (`[auth] enable_signup = false`, **email provider left on**), email confirmation on, minimum password length 12; unit tests | `npm test`, `npm run test:db` |
| 3 | **Built 17 October 2026.** People screen: invite, Send again, withdraw. `/auth/confirm`, password screen, Invitations screen with Accept and Decline. "Email me a sign-in link" on the sign-in page. Email templates. `invitations.spec.ts` | **`npm run test:all`** |
| 4 | **Built 17 October 2026.** Two-factor setup, add and remove, the code step at sign-in (no enforcement yet); TOTP helper; `two-factor.spec.ts` parts 1, 2, 5 | **`npm run test:all`** |
| 5 | **Built 17 October 2026**, after the owner approved 0009 with four changes (section 10). 0009 enforcement, `two_factor_rules.sql`, `verify_two_factor.sql`; every database suite runs with 0009 applied, at aal2; the end-to-end stack applies 0009 (its lockout guard runs for real) and `signIn()` enters the code; two-factor e2e parts 3, 4, 7, (a), (b) | **`npm run test:all`** |
| 6 | **Built 17 October 2026.** Owner reset of two-factor (`reset_two_factor`, in 0009); `supabase/recovery/remove_two_factor.sql`; recovery tests (database test of the file itself; e2e test 8); audit entries | **`npm run test:all`** |
| 7 | **Built 17 October 2026.** Sabotage runs S1–S34 with a report (`increment-6-sabotage-report.md`); README, CLAUDE.md, `how-it-works.md`, story status | **`npm run test:all`** before handover |

Handover to Amit happens only after step 7, with:
- the hosted settings to check (section 7);
- the rollout order (section 3);
- the manual checks the tests cannot make: real phone, real email, hosted settings.

---

## 10. Build notes, steps 5 to 7 (17 October 2026)

### The owner's four changes to 0009, as built

1. **Positive tests for 0008 under 0009** (`two_factor_rules.sql`): a client admin at aal2 creates, sends again and withdraws; at aal1 Send again and Withdraw are refused and change nothing (no row, no audit entry); an invitee with no authenticator lists, accepts and declines on a live aal1 session, and on a deleted session can do none of these; a new operator reads no client data until aal2.
2. **Missing claims.** A token with no `session_id` claim, and one with no `aal` claim (or an unknown value), read nothing, for the owner and for a viewer without an authenticator. To make the viewer case hold, **`session_active()` now also requires the `aal` claim to be `aal1` or `aal2`.** Before, a viewer's token without `aal` would have passed (`mfa_ok()` lets a viewer with no authenticator through at any level). Sabotage S34 removes this check.
3. **One transaction.** 0009 is wrapped in `begin; … commit;`, with the lockout guard as the first statement. `scripts/test-db.sh` checks that `access_ok()` does not exist after the guard stops, with **`to_regprocedure('public.access_ok()')`**, not `to_regproc('access_ok()')`: on PostgreSQL 16, `to_regproc` reads null for any name with brackets, even `now()`, so it could never fail (checked in a `postgres:16` container).
4. **`verify_two_factor.sql` header.** Run the whole file before applying; only the owner row must read ok; tell the operators and client admins it lists before applying. The file now runs without errors before 0009 exists (it uses `to_regprocedure`); checked before and after on a scratch database.

### Other changes made while building

- **`reset_two_factor(user_id)` and `record_security_event(action)` are in 0009**, as section 3 planned. Refusals: `reset_not_allowed`, `reset_own_two_factor`, `reset_no_such_user`, `security_event_not_allowed`, `security_event_unknown`, each with a message in `src/core/two-factor.ts`.
- **The setup hold for a required role without an authenticator** (T05-4) is in the middleware (page loads) **and** in `landingAfterSignIn()` and Accept (server actions render their next page inside the POST, where the middleware does not redirect). Pages open before setup: `/account/security`, `/account/password`, `/invitations`. The database stays the barrier.
- **The code step tries every verified authenticator**, so a code from a second phone works.
- **The existing database suites run with 0009 applied**: their `test_login` sets a live aal2 session (`auth.test_session()` in `local_bootstrap.sql`, a test stand-in only).
- **The end-to-end test users of required roles** (owner, client admin, other admin) get an authenticator at preparation, through the local API, before the migrations run, so 0009's guard passes for real. Keys stay in `e2e/.run/run.json` (ignored by git). The local stack accepts the same code more than once within its 30 seconds, so `signIn()` uses the current code.
- **Own membership rows stay readable with a stale token** (signature still valid, session deleted): `memberships_read` asks only `user_id = auth.uid()`, by design (T05-11). No client data is readable. The e2e recovery test records this.
- **Own two-factor changes are audited by the screen**, after Supabase confirms them (`record_security_event`). Someone who calls Supabase's API directly, skipping the screens, changes their own authenticators without an audit entry. Resets are audited by the database in the same transaction.

