# Marketing Automation Platform

Increment 1 of Slice 1: the data model with access rules, and the offer scoring engine.

Story IDs refer to the story bank, "Marketing Automation Platform: User Stories".

## What is in this increment

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
npm test          # 13 tests
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

The application itself: sign-in, screens, the site module, and the agents. Increment 2 is the Next.js application shell with sign-in, the client and brand screens, and the offer intake and scoring screen wired to this engine.
