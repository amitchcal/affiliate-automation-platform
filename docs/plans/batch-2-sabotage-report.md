# Batch 2 sabotage report

Run on 17 October 2026 on the development machine (Windows, Docker Desktop), against commit `876cd64` on `batch-2`. Local test databases only (ports 54421–54427). The hosted Supabase project was never touched.

**How each case ran:**
- In the foreground, one case at a time. Leftover application servers and Playwright browsers were stopped before each case.
- One temporary change broke one protection, then the named tests ran.
- The file was then restored with `git show HEAD:<file> > <file>`, and its hash and line endings were checked against a snapshot taken before the first case.
- At the end, every file matched the snapshot except `supabase/tests/subscriber_rules.sql`, which was strengthened during the run (B13).

**Scope.** Only rules that protect access, money, compliance or data isolation (owner's rule); display-only behaviour has no case.
- Most of these rules live in the database, where `npm run test:db` is the proof: eleven suites plus the recovery-file test, each with every migration applied.
- B5 is enforced by the application, so it ran the end-to-end test.
- B19 is a guard in the test tooling, proved by its unit test.
- B11 of the plan ("subscribe accepts wording from the request") does not apply: `subscribe()` has no parameter that could carry wording, and B33 covers the version it does take.

"Red" means the test failed for the reason the change was meant to cause, shown by its message.

| # | Change made | Test that went red, and the message | Protects |
| --- | --- | --- | --- |
| B1 | Public lookup ignores the site's status | DB: a draft or offline site was served | S01-6 |
| B2 | Public lookup ignores host verification | DB: "an unverified host was served" | S01-3, S01-6 |
| B3 | An update policy on `brand_domains` | DB: "a person set a host verified without the server's check" | S01-3 |
| B4 | `record_domain_check` granted to signed-in users | DB: "people can record a domain check" | S01-3 |
| B5 | The server checks and records without asking `can_check_domain` | E2E "2. Domains": the client admin's crafted check left the host `verified` (expected `pending`) | S01-3 |
| B6 | `go_live` skips the domain item | DB: the checklist refusal tests | S01-4 |
| B7 | `go_live` skips the standard-pages item | DB: the checklist refusal tests | S01-4 |
| B8 | `go_live` allowed for client admins | DB: "a client admin went live" | S01-5 (Q1) |
| B9 | Preview skips the client-access check | DB: "another client previewed the site" | S01-8 |
| B10 | A Links host serves pages | DB: "the Links host served pages" | S01-6 |
| B12 | `subscribe` ignores the consent tick | DB: "expected refusal signup_no_consent" | S08-2 |
| B13 | `subscribe` works on a site that is not live | **First run green**: no test had a site that was not live with sign-up on. Test added (an offline site and a draft site, both with sign-up on); second run red: "this was allowed: select subscribe('brand-a-test.com', 'offline@example.com', …)" | S08-1, S08-5 |
| B14 | A repeat sign-up updates the consent time and page | DB: "a repeat sign-up changed the original consent record" | S08-4 |
| B15 | A known address gets a different answer (plain insert) | DB: the repeat sign-up fails instead of the same quiet success | S08-4 |
| B16 | Viewers can read subscribers | DB: "a viewer read subscriber emails" | S08-6 |
| B17 | The delete audit copies the email address | DB: "the deletion audit entry … carries more than it should" | S08-7, addition 6 |
| B18 | Sign-up on with an old privacy page | DB: "expected refusal signup_privacy_outdated" | S08-1, addition 5 |
| B19 | The fake DNS resolver allowed against any address | Unit: the resolver guard tests | Tests never stand in for real DNS outside the local stack |
| B20 | Per-brand rate limit removed | DB: "expected refusal signup_rate_limited" | S08-8 |
| B21 | A filled honeypot stores the sign-up | DB: "the honeypot stored a sign-up" | S08-8 |
| B22 | One-verified-row-per-host index removed | DB: "two verified rows for one host" | Addition 2 |
| B23 | The add-host trigger skips the other-client check | DB: "expected refusal domain_taken" on adding | Addition 2 |
| B24 | Public lookup matches by suffix | DB: a look-alike host was served | Addition 3 |
| B25 | The host rule accepts IP addresses | DB: "1.2.3.4 should be refused as a host" | Addition 1 |
| B26 | `subscribe` works with the switch off | DB: "stored with sign-up off" | Q3 (switch default off) |
| B27 | The checklist ignores a failed re-check | DB: "a failed re-check should refuse" | Addition 4 |
| B28 | `set_signup` skips the contact-email check | DB: "expected refusal signup_no_contact_email" | Owner's item 5 |
| B29 | Placeholder check on publishing standard pages removed | DB: "expected refusal page_unresolved_placeholder" | Owner's item 5 |
| B30 | **Review change 1:** a live site's standard page can be unpublished | DB (`site_rules.sql`): "a standard page of a live site was unpublished" | Change 1 |
| B31 | **Review change 2:** a policy without the sign-up paragraph counts as current | DB: "a policy without the sign-up paragraph counted as current" | Change 2 |
| B32 | **Review change 3:** subscribe and the form ignore the policy check | DB: "the form shows with an outdated policy" | Change 3 |
| B33 | **Review change 4:** subscribe ignores the consent version | DB: "expected refusal signup_wording_changed, but this was allowed" | Change 4 |
| B34 | **Review change 5:** same-client re-verification allowed (pre-check for other clients only, and no mapping) | DB: "expected refusal domain_taken but got: duplicate key value violates unique constraint" | Change 5 |
| B34b | Change 5, informational: only the pre-check reverted | **Green, as intended**: the `unique_violation` mapping still answered `domain_taken`. The two parts back each other up | Change 5 |
| B35 | `site_already_live` removed | DB: "going live twice should say so" | Owner's extra |

**Total: 36 runs.**
- 34 red.
- B13 red on its second run, after the missing test was added.
- B34b green, as intended.

## Found by these runs

- **B13: a missing test, not a missing rule.** The rule was right. Sign-up checks that the site is live, through `signup_brand_for_host` and then `site_brand_for_host`. But the only draft site in the subscriber suite also had sign-up off, so the live check was never what refused it. The suite now covers an offline site and a draft site, each with sign-up on.

## Known limits

- **The per-visitor rate limit** at the application or edge is not built. It is a gate before any real sign-up is switched on (`docs/plans/batch-plan.md`). The database limit is per brand: 30 a minute.
- **Real DNS, Vercel's domain setup, and TLS** are not exercised. The tests use the fake resolver and Chromium's host mapping.

## Added cases, owner's request (17 October 2026)

Run against `0ac7fe9`, in the same way as the cases above:
- each case a separate run, in the foreground;
- leftover servers and browsers stopped first;
- restored with `git show HEAD:<file> > <file>`, with its hash and line endings checked against a fresh snapshot.

At the end, all 211 files matched the snapshot. B41 has two variants, one for each way a fallback could happen. Both ran the whole `site-launch.spec.ts`, because test 5 needs the earlier tests to have made the sites live.

| # | Change made | Test that went red, and the message | Protects |
| --- | --- | --- | --- |
| B36 | Deleting a published standard page of a live site allowed (the delete branch of `site_pages_keep_standard_live` removed) | DB (`site_launch_rules.sql`): "expected refusal {page_site_live}, but this was allowed: delete from site_pages …" | Review change 1 (delete included, kept by the owner's decision) |
| B37 | `take_offline` with no role check (a viewer or another client's admin) | DB: "expected refusal {site_offline_not_allowed}, but this was allowed: select take_offline(…)" | S01-5 (Q1) |
| B38 | `set_signup` allowed for a client admin (`can_approve` instead of `can_manage`) | DB (`subscriber_rules.sql`): "expected refusal {signup_not_allowed}, but this was allowed: select set_signup(…)" | S08-1 |
| B39 | `update_page_from_template` allowed for a client admin | DB (`privacy_signup_rules.sql`): "expected refusal {page_update_not_allowed}, but this was allowed" | Addition 5 (compliance text changed only by owner and operators) |
| B40 | A client admin may delete a subscriber (delete policy `can_approve`) | DB: "S-08: a client admin deleted a subscriber" | S08-7 |
| B41a | End to end: an unknown Host is treated as the platform (the middleware lets it through as an admin host, so the visitor gets the sign-in page) | E2E test 5: "unknown-e2e.com … Expected: 404" | Addition 3 |
| B41b | End to end: an unknown Host falls back to a brand's site (`getBrand` falls back to Launch One) | E2E test 5: "unknown-e2e.com … Expected: 404, Received: 200" | Addition 3 |

**All seven red on their first run.** No test was missing.

**Batch 2 totals: 43 runs.**
- 41 red on their first run.
- B13 red on its second run, after the missing test was added.
- B34b green, as intended: the mapping backs up the pre-check.

