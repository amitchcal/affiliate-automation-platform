# Increment 6 sabotage report

Run on 17 October 2026 on the development machine (Windows, Docker Desktop), on the local test stack only (ports 54421–54427). The hosted Supabase project was never touched.

- **S1–S26b** ran against the working tree that became commit `994bf37`, using a script in the session's scratchpad. Each case made one temporary change, ran the named tests, and wrote the original bytes back, checked by SHA-256. These runs were done in two sittings, because the background runs were stopped twice for low memory. When a run was stopped mid-case, its leftover break was found by comparing every file with a hash snapshot and reversed: S5 in 0008 the first time, S27 in 0009 the second.
- **S27–S34 and S25b** ran after commit `994bf37`, in the foreground, one case at a time. Leftover application servers and Playwright browsers were stopped between cases. Each break was restored with `git show HEAD:<file> > <file>`, and the file's hash and line endings were then checked against the snapshot. `admin.ts` is committed with Unix line endings but checked out with Windows ones; its Windows endings were put back, and its hash then matched.
- At the end, all 179 files in the snapshot matched it byte for byte. The only addition is the new test `src/core/supabase/admin.test.ts` (S25b).

"Red" means the named test failed **for the reason the change was meant to cause**, shown by the failure message. Database means `npm run test:db` (eight suites plus the recovery-file test, every suite with 0009 applied). End-to-end runs used Playwright with one worker. Where a run named one test (`-g`), only that test ran; the two-factor spec always ran whole, because its tests build on each other.

## Results

| # | Change made | Test that went red, and the message | Criterion it proves |
| --- | --- | --- | --- |
| S1 | `can_invite` lets a client admin give operator | DB: "expected refusal invite_role_not_allowed but the statement succeeded". E2E "crafted operator request": the refusal was not shown | T03-2 |
| S2 | Any client admin may invite into any client | DB: "expected refusal invite_other_client". E2E "second client" | T03-4 |
| S3 | Acceptance inserts a role other than the invitation's | DB: "the membership must have exactly the invitation's client and role" | T03-5 |
| S4 | `accept_invitation` ignores `accepted_at` | DB: "expected refusal invite_already_accepted but got: invite_already_member" (the already-member check is a second barrier; the test asks for the exact refusal) | T03-6 |
| S5 | `accept_invitation` ignores `expires_at` | DB: "expected refusal invite_expired but the statement succeeded". E2E "expired, withdrawn": wrong message | T03-7 |
| S6 | `accept_invitation` ignores `revoked_at` | DB: "expected refusal invite_withdrawn but got: … violates check constraint" (the one-outcome constraint is a second barrier) | T03-8 |
| S7 | `accept_invitation` skips the email match | DB: "expected refusal invite_not_for_you". E2E "expired, withdrawn" (another account) | T03-9 |
| S8 | `accept_invitation` skips `email_confirmed_at` | DB: "expected refusal invite_email_unconfirmed" | T03-9 |
| S9 | Insert policy and grant on `invitations` for signed-in users | DB: "a direct insert into invitations was allowed" | T03-1–T03-4 (all changes through the checked functions) |
| S10 | Invitations readable by any member of the client | DB: "a viewer can read invitations" | T03-4, T03-15 |
| S11 | `mfa_ok()` returns true | DB: "…a0 read client data with only a password". E2E: a password-only session read data | T05-2, T05-5 |
| S12 | Middleware no longer sends to the code step | E2E (a): the direct address was not redirected to the code step | T05-2 (screens) |
| S13 | Viewers marked as required | DB: "a viewer without two-factor must work with the password alone". E2E: the viewer was held | T05-6 |
| S14 | Last-authenticator check removed | E2E part 5: the last authenticator was removed | T05-7 |
| S15 | Service role key read from `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` | Build scan: "the test build contains the service role key (…people/page.js). Nothing was tested." | Section 4 rule 5 (secrets) |
| S16 | `config.toml` gets a real SMTP section | Unit: `e2e-guard.test.ts`, 2 of 15 failed | Section 7 (tests never send real email) |
| S17 | Local public sign-up on (`[auth] enable_signup = true`) | E2E "public sign-up is refused": the sign-up succeeded | Section 4 rule 9; T03-9 |
| S18 | 0009 lockout guard removed | DB runner: "0009 applied although the owner has no authenticator" | Rollout safety (section 3) |
| S19 | `mfa_ok()` ignores verified factors | DB: "a viewer who turned two-factor on read data with only a password". E2E part 7 | T05-10 |
| S20 | `resend_invitation` skips `can_invite` | DB: "expected refusal invite_resend_not_allowed". E2E "Send again" | T03-17 |
| S21 | The server sends the email before `resend_invitation` checks authority | E2E "Send again": an email arrived for the refused request | T03-17 |
| S22 | Invite form shows a different message for existing accounts | E2E "the response is the same": the responses differed | T03-10 |
| S23 | `memberships_read` becomes `is_owner()` only | DB: "a viewer should read only their own membership". E2E part 8: the setup screen said "optional" | T05-11, T05-12 |
| S24 | `decline_invitation` lets anyone decline | DB: "expected refusal invite_not_for_you … decline_invitation" | T03-16 |
| **S25** | Sign-in links may create accounts (`shouldCreateUser: true`) | **Green**: no account appeared, because public sign-up is off on the test stack and Supabase refused it. **Covered by S17** (that setting is tested), and by S25b for our own code | T03-18 |
| **S25b** | The same change, against the new unit test `src/core/supabase/admin.test.ts` | Unit: both tests failed, `"shouldCreateUser": true` where `false` is required. Restored, then 2 of 2 passed | T03-18 |
| S26 | The recovery SQL file skips deleting sessions and refresh tokens | DB recovery-file test: returned `"sessions_removed": 0`. E2E part 8: counts below 2 | T05-12; D4 |
| S26b | The owner's Reset skips deleting sessions and refresh tokens | DB: "reset returned 1 1 1". E2E part 6 | T05-8; D4 |
| S27 | `session_active()` returns true | DB: "a deleted session still reads data". E2E part 8: the old access token read data | D5 (Q12) |
| S28 | `create_invitation` returns a fourth column (`delivery`) | DB: "must return exactly invitation_id, email, expires_at; it returns {…,delivery}" | T03-10, T03-20 |
| S29 | The reset's audit entry is skipped | DB: "after the reset: 0/0/0/0" (no audit row) | T05-8, T05-9 (Q13) |
| S29b | The reset's audit failure is swallowed, so deletions happen without it | DB: "the reset succeeded although its audit row could not be written" | T05-8, T05-9 (Q13: same transaction) |
| S30 | `/auth/confirm` checks the link on opening (GET) | E2E "a scanner opening the link uses nothing": the browser got `/auth/confirm?error=link` after the scanner's fetch | T03-19 |
| S31 | Invite response gets an extra query parameter for existing accounts | E2E "the response is the same": the responses differed | T03-20 |
| S32 | The owner may reset their own two-factor sign-in | DB: "expected refusal {reset_own_two_factor}, but this was allowed" | Q13 |
| S33 | `reset_two_factor` not owner-only | DB: "expected refusal {reset_not_allowed,…}". E2E part 6: the client admin's crafted reset was not refused | T05-8 |
| S34 | `session_active()` no longer requires the `aal` claim | DB: "a token with no aal claim listed invitations" | Owner's change 2 (missing claims) |

**Total: 37 runs. 36 red** (S1–S34 with S26b and S29b, less S25, plus S25b). **1 green, S25**, explained above and covered by S17 and S25b.

## Criteria and the cases that prove them

| Criterion | Cases |
| --- | --- |
| T03-1 to T03-4 (who may invite whom, no other client) | S1, S2, S9, S10 |
| T03-5 (exactly the named role) | S3 |
| T03-6, T03-7, T03-8 (single use, expiry, revoke) | S4, S5, S6 |
| T03-9 (confirmed matching email) | S7, S8, S17 |
| T03-10, T03-20 (no account disclosure) | S22, S28, S31 |
| T03-15 (People screen limits) | S10 |
| T03-16 (decline) | S24 |
| T03-17 (Send again re-checks authority first) | S20, S21 |
| T03-18 (sign-in link never creates accounts) | S25 (green; covered), S25b, S17 |
| T03-19 (scanner-safe links) | S30 |
| T05-2, T05-5 (database enforces the second step) | S11, S12, S27, S34 |
| T05-6 (viewers without it unaffected) | S13 |
| T05-7 (last authenticator kept) | S14 |
| T05-8, T05-9 (owner reset, audited, same transaction) | S26b, S29, S29b, S32, S33 |
| T05-10 (a viewer who enrolled is held to it) | S19 |
| T05-11 (own memberships readable at aal1) | S23 |
| T05-12 (recovery signs out everywhere) | S23, S26, S27 |
| Secrets, test email, rollout safety | S15, S16, S18 |

## Known limits (not caught, by design or not yet)

- **Own two-factor changes are audited by the screen.** Turning it on, adding and removing are recorded by `record_security_event` after Supabase confirms the change. A person calling Supabase's API directly could change their own authenticators without an audit entry. No sabotage case covers this, because nothing in the database can stop it. Resets are audited by the database.
- **A deleted session's token still reads its own membership rows** until it expires (up to an hour). This is by design (T05-11), and the e2e recovery test records it. No client data is readable.
- **S4 and S6 are also stopped by a second barrier** (the already-member check, the one-outcome constraint). The tests went red because they ask for the exact refusal code.
