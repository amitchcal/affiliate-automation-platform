# Increment 5 plan: module split, Affiqube rename, test brands, T-07

Prepared 13 October 2026. Status: approved by the owner on 13 October 2026, with the decisions in section 8. Stage A committed (e1065ee). Database work committed (ee21877): 0005, 0006 (added at the owner's request, closing the client-consistency gap), verify files, tests. 0005 and 0006 applied on Supabase; all 15 `verify_modules.sql` and all 6 `verify_consistency.sql` rows ok. Stage B application code built, tested, and committed at the owner's go-ahead; the owner's walkthrough of the screens is still pending.

## 1. Scope

| In | Out (deliberately) |
|---|---|
| Move existing code into `src/core` and `src/modules/affiliate` | W-01, W-03 and C-01: after increment 6 (decision 3) |
| Rename the application to Affiqube | Renaming tables to `aff_`: a separate later increment (decision 2) |
| Migration 0005: replace AffiQube with AffilyVault and Famperia | Any dropshipping features. The dropshipping module starts as an empty shell. |
| **T-07:** business type switches modules on, refused in the database and on the server, changes logged | T-07's "re-runs the wizard": there is no wizard yet. This part moves to W-02 (R2). |

**Research findings.** Nothing in this increment calls an outside service. One framework fact shapes the layout: Next.js requires route files to live under `src/app`. Route files there will become short entry points that load screens from `src/core` or `src/modules/affiliate`. `src/app` is the only place allowed to import from both core and modules.

**Size.** This is more than the usual ten files, so it is built in two stages with a commit after each. Stage A only moves files, so if a test breaks, the move caused it.

## 2. Stage A: move the code, no change in behaviour

**Gate.** The baseline run on 13 October 2026 is **7 test files, 78 tests passing**. After the move, `npm test` must show the same 7 files and 78 tests. Inside the test files, only the import lines may change, which `git diff -M` will show. `typecheck` and `build` must also pass.

| From | To | Layer |
|---|---|---|
| `src/scoring/config.ts`, `score.ts`, `score.test.ts` | `src/core/scoring/` | Core (the architecture puts the scoring engine in core) |
| `src/lib/scoring-config.ts` and its test | `src/core/scoring/` | Core |
| `src/lib/compliance.ts` and its test | `src/core/compliance/` | Core (K-05 covers all creatives) |
| `src/lib/markdown.ts` and its test | `src/core/content/` | Core |
| `src/lib/supabase/server.ts`, `public.ts` | `src/core/supabase/` | Core |
| `src/components/BrandNav.tsx` | `src/core/components/` | Core. It will receive its tabs as input instead of hard-coding the affiliate tabs. |
| `src/lib/offers.ts` and its test | `src/modules/affiliate/offers/` | Affiliate |
| `src/lib/site.ts`, `public-site.ts`, `site.test.ts` | `src/modules/affiliate/site/` | Affiliate |
| `src/lib/clickbank.ts`, `results.ts`, `results.test.ts` | `src/modules/affiliate/results/` | Affiliate |
| Screen bodies and server actions under `brands/[brandId]/` (offers, site, pages, results) and `site/[host]/` | `src/modules/affiliate/screens/...` | Affiliate. Thin route files stay in `src/app`. |
| Clients screens | `src/core/screens/` | Core |

`src/middleware.ts`, `login` and the root layouts stay where they are, because Next.js requires it.

## 3. Stage B: rename, test brands, T-07

### Code changes

| File | Why |
|---|---|
| `package.json` (`"name": "affiqube"`), `src/app/layout.tsx`, `src/app/(app)/layout.tsx`, `README.md`, CLAUDE.md title, Layout and Commands sections | Rename to Affiqube and record the new layout |
| `src/middleware.ts` | Treat `affiqube.com` and `www.affiqube.com` as the platform's own address, never as a brand |
| **New** `src/core/modules.ts` | Business types and their labels, plus `modulesFor(type)` and `hasModule(brand, module)` |
| **New** `src/core/brand-access.ts` | `requireModule(brandId, module)` for screens and server actions. It returns a plain-language refusal. |
| **New** `src/modules/affiliate/module.ts`, `src/modules/dropshipping/module.ts` | Each module describes itself: id, label, brand tabs. Dropshipping has no tabs yet. |
| **New** `src/modules/index.ts` | The list of modules. Only `src/app` reads it, so core never imports a module. |
| `src/app/(app)/brands/[brandId]/page.tsx` → **new core brand overview** | Shows the brand's business type and lets owners and operators change it. Niche, platforms and business details move here, because they are core (C-01, O-01, O-07). |
| `src/app/(app)/brands/[brandId]/(affiliate)/layout.tsx` | One guard for every affiliate screen. A brand without the module sees: "This brand's business type is Dropshipping, so affiliate screens are switched off." |
| Each affiliate server action | Calls `requireModule` first, so a direct call is refused even if the screen is bypassed |
| Clients screen | Shows each brand's business type |

**URL change:** the offers list moves from `/brands/<id>` to `/brands/<id>/offers`. `/brands/<id>` becomes the brand overview.

## 4. Database: `supabase/migrations/0005_modules_and_test_brands.sql`

Safe to run twice: every step checks before it acts. Migrations 0001–0004 are not edited.

1. **Business type.** A new type with the values `affiliate`, `dropshipping` and `both`. `brands.business_type` is added as a required column. Existing brands become `affiliate`, which is true of every brand today.
2. **`brand_has_module(brand, module)`.** A function: "does this brand's type include this module?"
3. **Refusal in the database.** A trigger blocks inserts and updates for a brand without the affiliate module on `offers`, `offer_metrics`, `offer_rules`, `tracked_links` and `site_pages`. Deleting is still allowed, so old data can be cleaned up. `network_sales` is **not** blocked: sales are facts reported by ClickBank, and refusing them would lose earnings records.
4. **Public site.** `public_brand`, `public_pages`, `public_page` and `record_click` are recreated with one added condition: the brand must have the affiliate module. A dropshipping brand's domain therefore never serves an affiliate site or records clicks. `record_click` keeps 0004's `tid` logic unchanged.
5. **Audit.** A change of `business_type` writes a row to `audit_log` with the before and after values.
6. **Test brands** (decision 1: rename in place):
   - Brand `22222222-2222-4222-8222-222222222222` (AffiQube) becomes **AffilyVault, affilyvault.com, affiliate**. Its offers, links, approval settings and the ClickBank connection row (`vividham`) stay with it.
   - **Famperia, famperia.com, dropshipping**, niche "Home decoration", target country `US` (decision 4), is added under Vividha Marketing with id `33333333-3333-4333-8333-333333333333`. Every approval setting is set to approve first.
   - Step 6 does nothing on a database without Vividha Marketing, so test databases are unaffected. If another brand already uses either domain, it stops with a clear message.
   - It does **not** rewrite page text. Any standard page whose text still says "AffiQube" is legal text that needs the owner's review, so the verify query lists those pages instead of changing them.

### Verify query: `supabase/verify_modules.sql`

Each row reads "ok" or names what is wrong:

- business type column exists
- function exists
- 5 refusal triggers exist
- public functions updated
- no brand named AffiQube or on affiqube.com
- AffilyVault is affiliate
- Famperia is dropshipping
- Famperia has 4 approval settings and target country US
- the ClickBank key belongs to AffilyVault
- `public_brand('famperia.com')` returns nothing
- `public_brand('affilyvault.com')` returns AffilyVault
- pages still mentioning AffiQube: 0, or "review N pages"

## 5. Tests

| Test | Type | What it proves |
|---|---|---|
| The 7 existing files (78 tests) | Unit | Nothing changed in behaviour (gate for stage A) |
| `src/core/modules.test.ts` | Unit | Each business type turns on the right modules; an unknown type turns on none |
| `src/architecture.test.ts` | Unit | No file in `src/core` imports a module, and neither module imports the other. **Proof it can fail:** add a bad import, see it fail, remove it. |
| `supabase/tests/module_rules.sql` | Database | A dropshipping brand is refused offers, offer figures, rules, links and pages. "Both" and affiliate brands are allowed. Switching a brand to dropshipping blocks edits to its existing offers. Public functions return nothing for it. A type change is in `audit_log`. A client admin cannot change the type. **Proof it can fail:** drop the trigger, see the test fail, restore it. |
| `access_rules`, `site_rules`, `results_rules` | Database | Still pass unchanged with 0005 applied (twice) |
| `scripts/test-seed.sh` | Database | 0001 → 0002 → 0003 → 0004 → 0005 on a clean database produces the two test brands. `verify_modules.sql` reads all ok. |

`scripts/test-db.sh` will apply 0005 (twice) in each suite and add the `module_rules` suite. The database tests run in a `postgres:16` Docker container. Docker is available on the development machine; `psql` is not installed directly.

## 6. Acceptance criteria

| Story | Criterion |
|---|---|
| T-07 | Each brand has a business type: Affiliate marketing, Dropshipping or Both |
| T-07 | A brand's screens and tabs show only its enabled modules |
| T-07 | The database refuses affiliate inserts and updates for a brand without the module, proven by a test |
| T-07 | Affiliate server actions refuse a brand without the module, even when called directly |
| T-07 | The public site and click redirect return nothing for a brand without the affiliate module |
| T-07 | A business type change is recorded in `audit_log` with before and after |
| Architecture | Core imports no module; modules do not import each other (test) |
| Rename | The application shows "Affiqube"; `affiqube.com` is treated as the platform's own address |
| Seed | AffilyVault (affiliate) and Famperia (dropshipping) exist; AffiQube does not |
| Regression | The 78 original tests and the 3 original database suites pass |

## 7. Owner walkthrough

1. **PowerShell**, in the repository folder:
   ```powershell
   npm install
   npm test
   ```
   Expect the 7 original test files plus 2 new ones, all passing (78 plus the new tests; the final report gives the exact number).
2. **PowerShell:** run `npm run typecheck`, then `npm run build`. Both should finish without errors.
3. **Supabase SQL editor:** paste and run `0005_modules_and_test_brands.sql`, then `verify_modules.sql`. Every row should read `ok`. The AffiQube-pages row may instead read "review N pages".
4. **PowerShell:** run `npm run dev`. In the browser, open `http://localhost:3000` and sign in. The header reads **Affiqube**.
5. Open **Clients → Vividha Marketing**. You should see AffilyVault (Affiliate marketing) and Famperia (Dropshipping), and no AffiQube.
6. Open **AffilyVault**. The overview shows the business type and the Offers, Site and links, and Results tabs. Your earlier offers are under Offers.
7. Open **Famperia**. There are no affiliate tabs. Add `/offers` to the end of the address bar and press Enter. You should see the plain refusal message.
8. **Refusal in the database.** In the Supabase SQL editor, run:
   ```sql
   insert into offers (client_id, brand_id, name, network)
   values ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'Test', 'clickbank');
   ```
   It should fail with an error that names the missing affiliate module.
9. In the browser, open `http://localhost:3000/site/famperia.com`. Expect "not found". Then open `/site/affilyvault.com`, which shows the AffilyVault site if its standard pages are published.
10. On Famperia's overview, change the type to **Both**. The affiliate tabs appear. Then, in the Supabase SQL editor, run:
    ```sql
    select action, before->>'business_type', after->>'business_type', created_at
    from audit_log where entity = 'brands' order by created_at desc limit 1;
    ```
    It shows `dropshipping → both`. Set Famperia back to **Dropshipping**.
11. If step 3 listed pages to review, open each one under **AffilyVault → Site and links**, correct the brand name, and republish once you're satisfied with the legal text.

## 8. Decisions

Asked on 13 October 2026 and answered by the owner the same day.

| # | Question | Decision |
|---|---|---|
| 1 | How should AffiQube be replaced? | **Rename the existing brand row to AffilyVault.** Its offers, links, approval settings and ClickBank connection stay. |
| 2 | Rename the existing tables to `aff_` now? | **No: a separate increment later**, through a new migration. |
| 3 | The Build order in CLAUDE.md included W-01 and W-03 in increment 5 | **Corrected in CLAUDE.md:** increment 5 is the module split plus T-07. Increment 6 is T-03 and T-05, which completes Epic 1. W-01, W-03 and C-01 follow after that. |
| 4 | Famperia's target country | **United States** (`US`). |

Delivery: stop after stage A and show the test results. Commit only after the owner confirms.

## 9. Stage A results (13 October 2026)

| Check | Result |
|---|---|
| Unit tests before the move | 7 files, 78 passed |
| Unit tests after the move | 7 files, 78 passed |
| Type check | Pass |
| Production build | Pass, the same 12 routes as before |
| Core imports a module | None found (searched by hand; the automatic test comes in stage B) |
| Built app: `/login` | Loads (200) |
| Built app: `/clients` while signed out | Redirects to sign-in, as before |

All 33 moved files are recorded by git as moves. The only edits inside them are import lines; in the test files that is two lines and nothing else. The original route files in `src/app` are now two-line entry points, and every web address is unchanged.

**Not verified:**

- Screens that read the database (brand screens, public site, tracked redirect). The development machine cannot reach the Supabase project, so they showed "not found". That comes from the failed connection, not from the move.
- Database tests. They were not run because stage A changes no SQL. They run in stage B with migration 0005.

**Known and deferred:**

- The Layout section of CLAUDE.md still lists the old paths. It is updated in stage B, as planned.
- The moves are staged in git (`git mv` stages its changes); nothing is committed.

## 10. Open questions for the owner

| # | Question | What happens next |
|---|---|---|
| 5 | Do the brand screens still work in your browser? In PowerShell, in the repository folder, run `npm run dev`. Then open `http://localhost:3000`, sign in, and open AffiQube's Offers, Site and links, Results, and one page in the editor. Each should look as it did before. | If anything differs, I diagnose it before committing. |
| 6 | May I commit stage A? Message: "Increment 5 stage A: move code into core and affiliate module (T-07 groundwork)". | On "commit", I commit stage A, then start stage B. |
