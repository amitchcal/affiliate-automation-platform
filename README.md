# Affiqube

One platform for running affiliate marketing and dropshipping brands: a shared core, plus one module per kind of business. Increments 1 to 4 built the data model with access rules, the offer scoring engine, the application, the public brand site with compliant pages and tracked links, and results from ClickBank sales. Increment 5 split the code into core and modules and switched each brand's modules on by its business type.

Story IDs refer to the story bank in `docs/user-stories.md`. The architecture rules are in `CLAUDE.md`. A plain-language explanation of the whole product is in `docs/how-it-works.md`.

## Increment 5.1: automated end-to-end tests

Plan and decisions: `docs/plans/increment-5.1-plan.md`. One command now runs every test: `npm run test:all`.

| File | What it does |
| --- | --- |
| `scripts/test-all.mjs` | Type check, unit tests, database tests, end-to-end tests, in that order; stops at the first failure and prints a summary |
| `scripts/test-db.mjs` | Runs `scripts/test-db.sh` with the local `psql`, or inside a throwaway `postgres:16` Docker container |
| `scripts/e2e-db.mjs` | Starts this project's own local Supabase stack in Docker (ports 54421–54427), creates the four test users with new random passwords, applies 0001–0006, loads `e2e/seed.sql` |
| `scripts/e2e.mjs` | Builds the application into `.next-e2e` against the local stack, checks the build never names the hosted project, runs Playwright |
| `scripts/e2e-lib.mjs`, `scripts/e2e-guard.test.ts` | The guard: only `http://127.0.0.1:54421` is accepted; the hosted project, and ports 54321/54322 used by another local project, are refused. Unit tested. |
| `e2e/supabase/config.toml` | Local stack settings, with no migrations of its own |
| `e2e/seed.sql` | Separation Test Co, an approved Pet Sleep Guide offer, sales on fixed dates |
| `e2e/*.spec.ts` | 25 tests covering the increment 5 walkthrough (see the plan, section 3) |

Per-run passwords live only in `e2e/.run/`, which git ignores. `.env.local` is never read by the test build.

### Bug found by the new tests, and fixed

Migration 0006 added a second, composite foreign key between several pairs of tables (for example `offers` and `offer_metrics`). Supabase's data API then refuses a query that embeds one table in the other without saying which key to follow. Three screens were affected on any database with 0006 applied, **including the live Supabase project**:

| Screen | What the user saw | Fix |
| --- | --- | --- |
| Offers | "No offers yet", even with offers recorded | The query names `offer_metrics_offer_id_fkey` and `offer_rules_offer_id_fkey` |
| Site and links | Tracked links missing from the list | The query names `click_events_link_id_fkey` |
| Page editor | The page could not be opened | The query names `site_pages_brand_id_fkey` |

These queries now also show an error page if a query fails, instead of an empty list. No database change is needed.

### What was verified

| Check | Result |
| --- | --- |
| `npm run test:all` on the development machine (Windows, Docker Desktop) | Pass: type check; 104 unit tests; 5 database suites; 25 end-to-end tests. About 2 minutes. |
| The new tests catch a real fault | Before the fix, the Offers and page-editor tests failed against the 0006 schema; the tracked-links query was confirmed refused by calling the local data API directly |
| The fix on the live Supabase project | Not verified from here. Covered by the owner's walkthrough after deploying. |

## Increment 5: module split, test brands, module entitlement

Plan and decisions: `docs/plans/increment-5-plan.md`.

| File | What it does | Stories |
| --- | --- | --- |
| `src/core/`, `src/modules/affiliate/` | Existing code moved into core and the affiliate module. Route files in `src/app` are short entry points. | Architecture |
| `src/core/modules.ts` | Business types, which modules each switches on, brand tabs, plain-language refusal | T-07 |
| `src/core/brand-access.ts`, `src/modules/affiliate/guard.ts` | Server-side check that a brand has a module; every affiliate action calls it first | T-07 |
| `src/modules/affiliate/module.ts`, `src/modules/dropshipping/module.ts`, `src/modules/index.ts` | Each module describes its tabs; only `src/app` reads the list | T-07 |
| `src/core/screens/BrandOverview.tsx` | Brand overview: business type, niche and platforms, business details | T-07, O-01, O-07, C-01 |
| `src/app/(app)/brands/[brandId]/layout.tsx` | Shared brand header with the tabs of the brand's modules | T-07 |
| `src/app/(app)/brands/[brandId]/(affiliate)/layout.tsx` | One guard for every affiliate screen | T-07 |
| `src/architecture.test.ts` | Fails if core imports a module or one module imports another | Architecture |
| `supabase/migrations/0005_modules_and_test_brands.sql` | Business type, `brand_has_module()`, database refusal of affiliate writes, public site limited to affiliate brands, type changes audited, AffiQube renamed AffilyVault, Famperia added | T-07, T-06 |
| `supabase/migrations/0006_client_consistency.sql` | Every row's client matches its brand, offer, and link, enforced by composite foreign keys | T-01, T-02 |
| `supabase/tests/module_rules.sql`, `supabase/tests/consistency_rules.sql` | Database tests for both migrations | T-07, T-01, T-02 |
| `supabase/verify_modules.sql`, `supabase/verify_consistency.sql` | Checks to run in the Supabase SQL editor | T-07, T-01 |

The offers list moved from `/brands/<id>` to `/brands/<id>/offers`. `/brands/<id>` is now the brand overview. Niche, platforms, and business details are edited there.

### What was verified

| Check | Result |
| --- | --- |
| Unit tests | 90 passing: the 78 from increment 4, unchanged, plus 12 new |
| Type check, production build | Pass |
| Database tests on PostgreSQL 16 (Docker), 0005 and 0006 each applied twice | All five suites pass |
| Sabotage: refusal trigger on offers dropped | `module_rules.sql` fails |
| Sabotage: `offer_rules_offer_client_match` dropped | `consistency_rules.sql` fails |
| Sabotage: core imports a module | `architecture.test.ts` fails |
| 0005 on a copy shaped like the live project | Applied twice; `verify_modules.sql` as expected |
| 0005 on the owner's Supabase project | Applied by the owner; all 15 `verify_modules.sql` rows ok |
| 0006 on the owner's Supabase project | Applied by the owner; all 6 `verify_consistency.sql` rows ok |
| Screens against live data | Not verified from the development machine, which cannot reach Supabase. Covered by the owner's walkthrough. |

## Increment 4: results

| Path | Purpose | Stories |
| --- | --- | --- |
| `supabase/migrations/0004_results.sql` | Tracking code per link, `record_click` adds `tid`, `network_sales` table, ClickBank key assigned to one client | P-01, T-02 |
| `supabase/tests/results_rules.sql` | Database tests: tid construction, no duplicate re-import, rebills kept, access rules, key ownership | P-01, P-03, T-02 |
| `supabase/verify_results.sql` | Checks to run in the Supabase SQL editor after the migration | P-01 |
| `src/lib/clickbank.ts` | ClickBank Orders API client and import (server only) | P-01 |
| `src/lib/results.ts` | Clicks and sales combined per offer; unmatched totals per client | P-02 |
| `src/app/(app)/brands/[brandId]/results` | Results page with date range, and the manual import | P-01, P-03 |
| `src/app/(app)/clients/[clientId]` | Unmatched commissions for the client | P-01 |

### Apply the database change

Run `supabase/migrations/0004_results.sql` in the Supabase SQL Editor, then `supabase/verify_results.sql`. All eight rows should read "ok". The migration is safe to run twice.

Add `CLICKBANK_API_KEY` to `.env.local` yourself. It is read only on the server. This is temporary: per-brand credentials in `connections` (C-05) replace it.

### How sales are matched

- Every tracked link has an 8-character code. When a visitor clicks, the redirect adds `tid=<code>` to the seller's link, replacing any `tid` already there and keeping any `#fragment` at the end.
- The import pulls every ClickBank transaction for the account and date range. A transaction whose code matches a link is filed under that link's brand and offer. Anything else is kept at client level as unmatched.
- A transaction is stored once. Re-running an import skips transactions already stored; repeated rebills on one receipt are kept separately.
- Only the owner and operators can import, and only for the client whose ClickBank key is on the server. Client roles cannot see the connection, so the import is refused before ClickBank is called.
- No customer personal data is stored.

### What was verified

| Check | Result |
| --- | --- |
| Type check, 78 unit tests, production build | Pass |
| Database tests: access, site, and results rules | Pass on PostgreSQL 16, with `0004` applied twice |
| Tests fail when the protection is removed | Shown for 7 database rules and 2 unit-level rules |
| End to end in a real browser | Not done for this increment |
| Against your Supabase project | Migration applied; all 8 verify checks read "ok" |
| Against ClickBank | Not verified. The live import is untested until a real sale exists. |

## Increment 3: the public site, pages, and tracked links

| Path | Purpose | Stories |
| --- | --- | --- |
| `supabase/migrations/0003_site.sql` | Compliance templates, site pages, click records, publishing rules, public read functions | S-01, S-03, S-04, S-05, S-07, C-04 |
| `supabase/tests/site_rules.sql` | Database tests for the publishing rules and visitor access | S-03, S-04, S-07, O-05, T-02 |
| `src/middleware.ts` | Serves a brand's site on its own domain, and the application on admin hosts | S-01 |
| `src/app/site/[host]` | The public site: home page, pages, and the click-recording redirect | S-01, S-05, S-07 |
| `src/app/(app)/brands/[brandId]/site` | Business details, standard pages, offer pages, articles, tracked links | C-01, C-04, S-02, S-04, S-06, O-06 |
| `src/app/(app)/brands/[brandId]/pages/[pageId]` | Page editor with draft, wording check, preview, publish | S-03, K-05 |
| `src/lib/markdown.ts` | Page renderer that escapes all HTML | S-02 |
| `src/lib/compliance.ts` | Wording check run before publishing | K-05 |

### Apply the database change

Run `supabase/migrations/0003_site.sql` in the Supabase SQL Editor, then `supabase/verify_site.sql`. All six rows should read "ok".

### How the public site is served

- On an admin host (localhost, any `*.vercel.app` address, or a host listed in the `ADMIN_HOSTS` environment variable) the application is served, and a brand's site can be previewed at `/site/<domain>`.
- On any other host, the request is treated as a brand's own domain and that brand's site is served from the root. To put a brand live, point its domain at the deployment; no code change is needed.
- Visitors have no table access. They read published content through four database functions and nothing else.

### Publishing rules

| Rule | Enforced by |
| --- | --- |
| A page with no content cannot be published | Database |
| An offer page needs an approved offer | Database |
| Offer pages and articles need all four standard pages published first | Database |
| Wording must pass the compliance check | Application, before the database is asked |
| Saving a draft never changes what visitors see | Separate draft and published fields |
| Publishing and unpublishing are recorded | Audit log |

Every offer page carries the affiliate disclosure, added by the page template, so a page cannot be published without it.

### What was verified

| Check | Result |
| --- | --- |
| Type check, 43 unit tests, production build | Pass |
| Database tests: access rules and site rules | Pass on PostgreSQL 16 |
| End-to-end, in a real browser against a local database and API | 18 checks pass, covering sign-in, scoring, approvals, standard pages, the wording check, publishing, the public site, the click redirect, and click counts |
| Routing by domain | Verified: a brand domain serves its site at the root, cannot reach the application, and an unknown domain returns "not found" |
| Against your Supabase project | Not verified from here. Run the walkthrough below. |

### Walkthrough for increment 3

1. Approve an offer for the brand (see increment 2), entering your affiliate link.
2. Open **Site and links**. Fill in the business details and save.
3. Click **Create standard pages**, open each of the four, read it, and publish it.
4. Create the offer page, write its content, and publish. Try a phrase such as "the best course" first to see the wording check refuse it.
5. Click **View the public site**. The home page should list the offer; its page should show the disclosure and the button.
6. Click the button. You should land on the seller's site, and the link's click count on **Site and links** should rise by one.

## Increment 2: the application

| Path | Purpose | Stories |
| --- | --- | --- |
| `src/middleware.ts` | Keeps the session fresh; sends signed-out visitors to sign-in | T-02 |
| `src/app/login` | Sign-in with email and password | T-02 |
| `src/app/(app)/clients` | Client list and a client's brands | T-01, T-04 |
| `src/app/(app)/brands/[brandId]` | Niche and platform choices, ranked offers, offer intake, approvals | O-01, O-02, O-03, O-05, O-07, O-08, C-03 |
| `src/lib/scoring-config.ts` | Loads the scoring configuration: brand, then client, then platform default | C-08 |
| `src/lib/offers.ts` | Turns stored rows and form input into scoring input | O-02, O-08 |

### Run the application

1. Copy `.env.example` to `.env.local`.
2. In Supabase, open **Project Settings > API** and copy the **anon public** key into `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Do not use the service role key.
3. Start it:

```bash
npm install
npm run dev
```

4. Open http://localhost:3000 and sign in with the user created in Supabase.

### Deploy to Vercel (development)

1. Import the GitHub repository in Vercel.
2. Add the two variables from `.env.example` under **Settings > Environment Variables**.
3. Deploy. Vercel detects Next.js without further settings.

### What was verified, and what was not

| Check | Result |
| --- | --- |
| Type check | Passes |
| Unit tests | 24 pass at increment 2; 43 now |
| Production build | Passes |
| Signed-out requests redirect to sign-in | Verified against the built application |
| Screens render on desktop and mobile | Verified with sample data in place of the database |
| Sign-in and data against the real Supabase project | Not verified. It needs the project's anon key, which is entered only on your machine. Run the walkthrough below. |

### First-run walkthrough

1. Sign in. You should land on **Clients** and see Vividha Marketing with one brand.
2. Open AffiQube. Enter a niche, tick platforms, and save.
3. Add an offer with these figures: payout 42.25, conversion rate 0.40, earnings per click 0.17, gravity 14.92, recurring No, compliance risk Low, seller restrictions Low. It should score 48 and be marked Free traffic.
4. Click **Approve offer** before approving the rules. You should be told to approve the seller's rules first.
5. Click **Approve seller's rules**, then **Approve offer**. It should now show as approved.
6. In Supabase, open the `audit_log` table. The approvals should be recorded with your user ID.

### Note on TypeScript

TypeScript is pinned to version 5. Next.js 15 does not yet read the project settings correctly with TypeScript 7.

## Increment 1: data model and scoring engine

| Path | Purpose | Stories |
| --- | --- | --- |
| `supabase/migrations/0001_core.sql` | Tables, access rules, approval and audit triggers | T-01, T-02, T-04, T-06, C-01, C-03, C-05, C-06, C-08, O-01, O-02, O-05, O-06, O-07 |
| `supabase/tests/access_rules.sql` | Tests that prove the access rules on a real PostgreSQL | T-02, T-04, T-06, C-03, C-05, C-08, O-05 |
| `src/scoring/config.ts` | Scoring weights, scales, and thresholds | C-08 |
| `src/scoring/score.ts` | Weighted score, break-even cost per click, channel, plain-language explanation | O-03, O-08 |
| `src/scoring/score.test.ts` | Scoring tests using real ClickBank figures | O-03, O-08, C-08 |

## Run it

Every test, in one command (needs Node 20 or later and Docker Desktop running):

```bash
npm install
npx playwright install chromium   # once
npm run test:all
```

Parts on their own: `npm test` (unit), `npm run test:db` (database), `npm run test:e2e` (end-to-end; extra arguments go to Playwright, for example `npm run test:e2e -- e2e/site.spec.ts`). Screenshots are saved in `test-results/e2e/screens`; open the report with `npx playwright show-report test-results/e2e/report`.

Scoring engine only:

```bash
npm test          # 104 tests
npm run typecheck
```

Database access rules (needs a local PostgreSQL and a superuser, or a `postgres:16` Docker container):

```bash
./scripts/test-db.sh
```

The script creates scratch databases, applies the schema, and runs the tests. Five lines reading `ALL ACCESS RULE TESTS PASSED`, `ALL SITE RULE TESTS PASSED`, `ALL RESULTS RULE TESTS PASSED`, `ALL CONSISTENCY RULE TESTS PASSED`, and `ALL MODULE RULE TESTS PASSED` mean every rule held.

To apply the schema to Supabase, run `supabase/migrations/0001_core.sql` in the SQL editor or with the Supabase CLI. The files `local_bootstrap.sql` and `local_grants.sql` are only for local testing; Supabase provides those pieces itself.

## How access works

- Every client-owned row carries `client_id`.
- A user's rights come from the `memberships` table. The owner has one row with no client, which gives access to all clients.
- Four functions decide access: `is_owner()`, `has_client_access()`, `can_manage()` (owner and operators), and `can_approve()` (those plus the client's admin).
- Connections to networks and ad accounts are visible only to the owner and operators. The table stores a reference to each secret, never the secret.
- An offer can be approved only after its rules record is approved. A tracked link can be created only for an approved offer.
- Changes to scoring configuration, approval settings, offers, rules, and connections are written to `audit_log`, which has no update or delete policy.

## Agents and the service role

Agents run on the server with Supabase's service role, which bypasses row-level security. Agent code must therefore:

1. Scope every query by `client_id` and `brand_id`.
2. Write through these tables, so the approval and audit triggers still fire.
3. Read `approval_settings` before any action that publishes or spends.

## Acceptance status

| Story | Acceptance test | Status |
| --- | --- | --- |
| T-01 | Every record carries a client ID | Met by the schema |
| T-02 | A client login cannot read another client's rows, proven by a test | Met; tested |
| T-04 | The owner can open any client's brands | Met; tested |
| T-06 | Each entry records actor, time, action, before and after | Met; tested |
| T-01, T-02 | A row cannot name one client while pointing at another client's brand, offer, or link | Met; tested at the database (0006) |
| T-07 | Business type is Affiliate marketing, Dropshipping, or Both, and enables the matching modules | Met; tested |
| T-07 | Screens of a disabled module are hidden | Met: tabs come from the brand's modules; affiliate screens show a plain refusal. Owner walkthrough pending. |
| T-07 | Actions of a disabled module are refused on the server | Met: every affiliate action checks first, and the database refuses the writes; database part tested |
| T-07 | Changing the type is logged | Met; tested |
| T-07 | Changing the type re-runs the wizard for the new steps | Not yet: the wizard does not exist. Moves to W-02. |
| C-03 | No approval without an approved rules record | Met; tested at the database. The content-generation check comes with the site module. |
| C-05 | Secrets never reach the browser | Partly met: client roles cannot read connections. Vault storage comes with the first integration. |
| C-06 | Approval mode per action type | Table in place; enforcement comes with the actions themselves |
| C-08 | Weights total 100; changes audited | Met; tested |
| O-02 | Each figure carries its date | Met by `offer_metrics` |
| O-03 | Score, break-even, channel, explanation | Met; tested |
| O-05 | Unapproved offers cannot be used | Met; tested |
| O-06 | Links store channel, campaign, creative | Table in place; link generation comes next |
| O-08 | Shows what is missing; provisional until terms recorded | Scoring side met; the intake screen comes next |
| P-01 | Sales imported and matched to tracked links by tracking code | Partly met: manual import, tested on sample responses. The daily schedule comes later. Untested against live sales. |
| P-01 | Re-running an import does not duplicate rows | Met; tested at the database |
| P-01 | No customer personal data stored | Met; tested |
| P-02 | Clicks, sales, gross, refunded, net, EPC, and conversion rate per offer | Met; tested |
| P-02 | Refunds and chargebacks reduce net commission whether sent negative or positive | Met; tested |
| P-03 | A client sees only their own results | Met; tested at the database |
| P-03 | Results limited to the chosen date range | Met by the page's date filter; not covered by an automated test |

## Not built yet

- The agent that drafts offer pages and articles (S-02, R-02). Pages are written by hand for now, from a starting structure.
- A daily automatic ClickBank import (P-01). The import is a button for now.
- Screens for creating clients and brands, and for editing scoring weights. These are done in SQL for now.
- Any dropshipping screens. Famperia has the module switched on, but its screens arrive from release R5.
- Renaming the affiliate tables to the `aff_` prefix. Its own increment later.
- Paid campaigns (Slice 2).
