# Marketing Automation Platform

Increments 1 and 2 of Slice 1: the data model with access rules, the offer scoring engine, and the web application for signing in, choosing a niche and platforms, and scoring offers.

Story IDs refer to the story bank, "Marketing Automation Platform: User Stories".

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
| Unit tests | 24 pass |
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

Scoring engine (needs Node 20 or later):

```bash
npm install
npm test          # 24 tests
npm run typecheck
```

Database access rules (needs a local PostgreSQL and a superuser):

```bash
./scripts/test-db.sh
```

The script creates a scratch database, applies the schema, and runs the tests. A final line reading `ALL ACCESS RULE TESTS PASSED` means every rule held.

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
| C-03 | No approval without an approved rules record | Met; tested at the database. The content-generation check comes with the site module. |
| C-05 | Secrets never reach the browser | Partly met: client roles cannot read connections. Vault storage comes with the first integration. |
| C-06 | Approval mode per action type | Table in place; enforcement comes with the actions themselves |
| C-08 | Weights total 100; changes audited | Met; tested |
| O-02 | Each figure carries its date | Met by `offer_metrics` |
| O-03 | Score, break-even, channel, explanation | Met; tested |
| O-05 | Unapproved offers cannot be used | Met; tested |
| O-06 | Links store channel, campaign, creative | Table in place; link generation comes next |
| O-08 | Shows what is missing; provisional until terms recorded | Scoring side met; the intake screen comes next |

## Not built yet

- Tracked link generation and the redirect endpoint (O-06, S-07).
- The site module: public brand sites, offer pages, articles, and the draft, approve, publish flow (Epic 4).
- Agents, and the ClickBank import (P-01).
- Screens for creating clients and brands, and for editing scoring weights. These are done in SQL for now.
