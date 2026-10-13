# Increment 5.1 plan: automated end-to-end testing

Prepared 13 October 2026. Status: approved by the owner on 13 October 2026, with the answers in section 8. Building starts next session.

## 1. Scope

- Run Supabase locally with the Supabase CLI in Docker, apply migrations 0001–0006, and load test data.
- Add Playwright end-to-end tests covering the increment 5 walkthrough.
- One command runs every test: unit, database, and end-to-end.
- Add a rule to CLAUDE.md: every increment adds end-to-end tests for its acceptance rows, and work is handed to the owner only when all tests pass.
- Record what cannot be tested locally, and how it is covered.

Not in scope: new features, or changes to applied migrations.

## 2. Local Supabase, never the hosted project

- The Supabase CLI is added as a version-pinned dev dependency.
- Its local configuration lives in a separate folder, `e2e/supabase/`, with no migrations. The CLI must not apply `supabase/migrations` itself, because 0002 needs the owner's sign-in account to exist first.
- `scripts/e2e-db.mjs`:
  1. starts the local stack in Docker;
  2. creates the test users through the local sign-in service;
  3. applies 0001–0006 in order;
  4. loads `e2e/seed.sql`.
- **Test users.** Each run generates new random passwords and keeps them only for that run, in memory and in a file that git ignores. Nothing password-like goes into the repository, which is public.

| User | Role | Client |
|---|---|---|
| `amit.chakraborty@affilyvault.com` (the address 0002 expects) | owner | none |
| client admin | client_admin | Vividha Marketing |
| client viewer | client_viewer | Vividha Marketing |
| second client's admin | client_admin | Separation Test Co |

- **Test data:**
  - Vividha Marketing with AffilyVault and Famperia, from 0002 and 0005;
  - Separation Test Co with one brand, to test separation between clients;
  - for AffilyVault: one offer with figures, one rules record, and a few sales rows, so Results has data to show.
- **Guards against the hosted project:**
  - The test run refuses to start unless the Supabase address is `http://127.0.0.1:54321`.
  - The application under test gets its settings passed in directly, so `.env.local` is never read.
  - It builds into its own folder, `.next-e2e`, through one line in `next.config.mjs`, so the owner's normal build is not touched.

## 3. Playwright tests (`e2e/`)

Playwright's own Chromium, version-pinned with `@playwright/test`. Each key step saves a screenshot to `test-results/e2e/`, and an HTML report is produced.

| Test file | Covers | Walkthrough steps |
|---|---|---|
| `overview.spec.ts` | Each of the 3 saves shows its message and the saved values at once; saving twice; F5 shows the saved values | 3, 4 |
| `tabs.spec.ts` | AffilyVault shows 4 tabs; Famperia shows the Overview only, with Affiliate Off and Dropshipping On | 1, 2, 11 |
| `famperia-refusals.spec.ts` | `/offers`, `/site`, `/results` and `/pages/x` refused with the message; `/site/famperia.com` not found; the database refuses a Famperia offer even when a signed-in request skips the screens | 12, 13, 14 |
| `business-type.spec.ts` | Famperia switched to Both shows the tabs; switched back hides them; 2 audit entries | 15, 16, 17 |
| `offers.spec.ts` | Add an offer and see its score; approve the rules record, then the offer | 5 |
| `site.spec.ts` | Create and publish the standard pages; create an offer page; save draft and publish; the public site at `/site/affilyvault.com`; create a tracked link; a click is recorded (the redirect to the seller is stopped inside the browser, so no outside site is called) | 6, 7, 8, 9 |
| `results.spec.ts` | Date range changes the totals; the import form is shown to the owner and hidden from the client viewer | 10 |
| `roles.spec.ts` | A client viewer's saves are refused with a message; a client admin cannot change the business type; the second client's admin cannot see Vividha's brands | T-01, T-02, T-07 |

## 4. One command

`npm run test:all` runs a Node script that works in PowerShell. In order, it runs:

1. unit tests;
2. database tests, using the current `scripts/test-db.sh`;
3. the local Supabase start and the end-to-end tests.

It stops at the first failure and prints a summary with the location of the screenshots and the HTML report.

## 5. CLAUDE.md rule

"Every increment adds end-to-end tests for its acceptance rows. Work is handed to the owner only when `npm run test:all` passes."

## 6. What cannot be tested locally, and how it is covered

| Item | Coverage |
|---|---|
| ClickBank's live API | The unit tests of the import logic, plus the end-to-end check that the import is refused without a key. The first real sale is the owner's manual check. |
| The hosted project's settings (sign-in settings, permissions) | The `verify*.sql` files the owner runs after each migration |
| Real domains, DNS and secure connections | Middleware tests with a brand domain set on the request; the live check comes after deployment |
| Browser extensions in the owner's browser | Not covered; the tests run in a clean browser |

## 7. Cost and time

No money. The first run downloads the Supabase Docker images, a few GB, and Playwright's Chromium, about 150 MB. Each run after that should take about 2–4 minutes.

## 8. Decisions (13 October 2026)

1. Test users' passwords are generated on each run. Nothing password-like goes into the repository, which is public.
2. Playwright's own Chromium, version-pinned.
3. This plan is saved as `docs/plans/increment-5.1-plan.md`. Building starts next session.
