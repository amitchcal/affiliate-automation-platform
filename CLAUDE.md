# Affiqube: project context

This file gives Claude Code the context for this repository. Read it before making changes. It records what the product is, what has been decided, what is built, and how work is expected to be done.

Last updated: 17 October 2026, after increment 5.1 (end-to-end tests built; increment 5 still awaiting the owner's walkthrough).

## What this product is

Affiqube is a multi-tenant platform that runs digital marketing for several brands and clients, for two kinds of business: affiliate marketing and dropshipping. A shared core serves both, and each business type is a module (see "Architecture" below). Agents do the work; people set the limits in configuration and approve what matters.

- **Owner:** Amit Chakraborty, trading as Vividha Marketing (Kolkata, India).
- **Purpose:** first to run Amit's own brands, then to deliver digital marketing as a service to other clients.
- **First client:** Amit himself. Client "Vividha Marketing", with two test brands: AffilyVault (affiliate marketing, `affilyvault.com`) and Famperia (dropshipping, `famperia.com`). See "Test brands" below. Migration 0005 renamed the earlier seeded brand AffiQube to AffilyVault (same id) and added Famperia.
- **Why it exists:** each extra Shopify store costs a monthly fee, and an affiliate site uses little of what Shopify offers. The platform hosts affiliate brand sites itself, and manages dropshipping brands whose stores stay on Shopify.

AffilyVault was first built by hand as a Shopify store. It remains the reference for how a compliant affiliate site should read, and its pages move onto the platform under S-12.

## Architecture: one platform, a shared core, two modules

Decided 13 October 2026. This section overrides anything earlier in this file that describes the platform as affiliate-only.

Affiqube is one product with one codebase, one database, and one deployment. It serves two kinds of business through modules:

| Layer | Holds | Workstream in the story bank |
| --- | --- | --- |
| Core | Clients, brands, roles, audit log, configuration, budgets and approvals, scoring engine, brand setup wizard, creatives, campaigns, guardrails, email, reporting, currency | Core |
| Affiliate module | Offers, seller rules records, platform-hosted brand sites, tracked links, affiliate network imports | Affiliate |
| Dropshipping module | Suppliers, products, research records, pricing and margin, product compliance, listings, store orders, fulfilment, returns, store payouts | Dropshipping |

### Rules

1. **Core never depends on a module.** Core code must not import from `src/modules/*`, and core tables must not reference module tables. Modules plug into core through defined extension points: the brand's revenue source, its item type (offer or product), its profit calculation, and its wizard steps.
2. **Modules never depend on each other.** Anything both need moves into core.
3. **Each brand's business type switches its modules on (story T-07).** The type is Affiliate marketing, Dropshipping, or Both. Screens, wizard steps, server actions, and agents of a disabled module are hidden from the interface and refused on the server.
4. **Layout.**
   - `src/core/` for core logic and screens
   - `src/modules/affiliate/` and `src/modules/dropshipping/` for each module
   - Database tables for a module carry its prefix (`aff_`, `ds_`). Existing affiliate tables are renamed only through a new migration, never by editing an applied one.
5. **Tests follow the layers.** Each module has its own tests. A test must prove that a brand without a module is refused that module's actions.
6. **Shared stories are verified on both test brands.** A Core story is finished only when walked through on AffilyVault and on Famperia. Record this in the Verified columns of the story bank.

### Brand setup wizard

A brand is created with only a name, a logo, and a business type (W-01). Everything else is collected by a guided wizard whose steps come from the core list plus the steps of each enabled module (W-02). Every answer saves to the server as it is entered, and the wizard reopens at the last incomplete step on any device (W-03). Each module registers its own wizard steps; core owns the wizard engine. The step list is in the "Wizard steps" sheet of the story bank.

### Test brands

| Brand | Business type | Storefront | Notes |
| --- | --- | --- | --- |
| AffilyVault, affilyvault.com | Affiliate marketing | Shopify today; pages move onto the platform under S-12 | Until S-12, tracked links can run on a subdomain such as `go.affilyvault.com` |
| Famperia, famperia.com | Dropshipping | Shopify, a separate store | Home decoration niche |

The seeded test brand named AffiQube on affiqube.com is replaced. `affiqube.com` is the platform's own host, not a brand.

### Build order

The story bank's Release column is the plan, with this correction decided on 13 October 2026:

- **Increment 5:** move existing code into `src/core` and `src/modules/affiliate`, rename the application to Affiqube, replace the seeded brand with the two test brands, and add module entitlement (T-07). Plan: `docs/plans/increment-5-plan.md`.
- **Increment 6:** client admin invites own users (T-03) and two-factor sign-in for admin roles (T-05). This completes Epic 1.
- **After that:** start-a-brand (W-01), save-and-resume (W-03), and the brand profile (C-01).
- **Later, its own increment:** rename existing affiliate tables to the `aff_` prefix through a new migration.

The full release list is in `docs/user-stories.md` under "Release plan".

## Decisions already made

Do not reopen these without the owner asking.

| Decision | Detail |
| --- | --- |
| Stack | Next.js 15 (App Router), TypeScript 5, Supabase (Postgres, Auth), Vitest |
| Hosting | Vercel for development. Hostinger for live, only if the plan runs Node.js (VPS or Node hosting); shared hosting cannot run this |
| Tenancy | One database. Every client-owned row carries `client_id`. Row-level security on every table |
| Roles | owner, operator, client_admin, client_viewer. The owner has one membership row with no client |
| Agents | Run on the server. Must scope every query by client and brand, write through the normal tables so triggers fire, and read `approval_settings` before publishing or spending |
| Money | Budgets and caps are set by a person in configuration. Agents never raise spend on their own; actions that reduce spend may run unattended |
| Compliance content | Standard and replicated: templates in `compliance_templates`, copied into each site |
| Checkout | Hosted checkout from a payment provider, for the owner's own digital products later. Never build payments |
| Shopify | Read-only integration later, for dropshipping brands. Not a replacement |
| Affiliate network | ClickBank first. The owner's affiliate nickname is `vividham` |
| Language | American English on public sites (US audience) |

## Compliance rules for affiliate content

These take priority over conversion. They come from ClickBank's promotional guidelines and US advertising rules, and they apply to every page and ad an agent writes for an affiliate brand. Product compliance for dropshipping brands (product safety, claims, and listings) is a separate set of stories in the Dropshipping workstream and is not covered here.

1. Disclose the affiliate relationship clearly, on the page and near the links.
2. No fake reviews or testimonials. Pages are overviews based on the seller's published information, and say so, unless the product was really used.
3. No unsubstantiated superlatives ("best", "#1", "top-rated").
4. No false scarcity or urgency.
5. No false or unprovable claims, including health and results claims. Attribute claims to the seller.
6. Do not appear to be the seller. State that the site is an independent affiliate.
7. No content aimed at children under 13. Address parents and owners.
8. No spam. Never buy through the brand's own affiliate link.

Each seller also has its own rules, stored per offer in `offer_rules`. Example already met: one seller forbids bidding on its brand name in paid search and forbids a Facebook page named after the product.

In code: `src/core/compliance/compliance.ts` checks wording before publishing. It is a first line of defence, not legal review. Extend it; do not weaken it. Standard pages are exempt because they are the compliance text itself.

Do not put a product's price on a page. Link to the seller for the current price.

## What is built

| Increment | Contents | Status |
| --- | --- | --- |
| 1 | Schema with row-level security, approval and audit triggers, offer scoring engine | Done, verified on the owner's Supabase project |
| 2 | Sign-in, client and brand screens, niche and platform choice, offer intake, scoring, approvals | Done, verified on the owner's Supabase project |
| 3 | Compliance templates, site pages with draft and publish, wording check, public brand site by domain, tracked links with click recording | Done, tested end to end locally. Owner still to run `0003_site.sql` and the walkthrough |
| 4 | ClickBank sales import (P-01 partial), combined metrics per offer (P-02), results dashboard per brand with date range (P-03) | Done; unit and database tests pass on PostgreSQL 16. `0004_results.sql` applied on the owner's Supabase project and all 8 `verify_results.sql` checks read ok. Live import path untested until the first real sale exists. |
| 5 | Code split into core and the affiliate module; renamed Affiqube; AffiQube seed renamed AffilyVault and Famperia added; module entitlement by business type (T-07); every row's client matches its parents (0006) | Built. 90 unit tests and five database suites pass on PostgreSQL 16. 0005 applied on Supabase, all 15 `verify_modules.sql` rows ok. 0006 applied on Supabase, all 6 `verify_consistency.sql` rows ok. Application code committed; owner walkthrough of the screens pending. |
| 5.1 | Local Supabase in Docker for tests; 25 Playwright end-to-end tests of the increment 5 walkthrough; `npm run test:all` runs every test. Fixed three screens (Offers, tracked links, page editor) whose embedded queries 0006 had made ambiguous | Built. `npm run test:all` passes: 104 unit tests, five database suites, 25 end-to-end tests. Fix not yet checked on the live project. |

### Layout

```
supabase/migrations/   0001_core.sql, 0002_seed_first_client.sql, 0003_site.sql, 0004_results.sql,
                       0005_modules_and_test_brands.sql, 0006_client_consistency.sql, 0007_privacy_template_wording.sql
supabase/tests/        access_rules.sql, site_rules.sql, results_rules.sql, consistency_rules.sql, module_rules.sql,
                       privacy_template_rules.sql,
                       local_bootstrap.sql, local_grants.sql
supabase/verify*.sql   checks to run in the Supabase SQL editor: verify, verify_site, verify_results, verify_modules, verify_consistency, verify_privacy
scripts/test-db.sh     runs the database tests on a local PostgreSQL (or in a postgres:16 Docker container)
scripts/test-all.mjs   npm run test:all: type check, unit, database, end-to-end; stops at the first failure
scripts/e2e*.mjs       local Supabase stack for tests (ports 54421-54427, never the hosted project), test build, Playwright
e2e/                   Playwright tests (*.spec.ts), seed.sql, supabase/config.toml, support/helpers.ts
docs/                  user-stories.md, how-it-works.md (plain-language explanation, updated every increment), plans/
src/core/              shared by every business type; never imports a module
  modules.ts           business types, module definitions, brand tabs, refusal wording (T-07)
  brand-access.ts      server-side check that a brand has a module (server only)
  scoring/             scoring engine (config, score) and scoring-config loading
  compliance/          wording check (K-05)
  content/             Markdown renderer
  supabase/            server and public clients
  components/          BrandNav (tabs passed in)
  screens/             clients list, brand overview and its actions
src/modules/affiliate/ offers, site, public-site, results (clickbank server only), screens, guard.ts, module.ts
src/modules/dropshipping/  module.ts only, until release R5
src/modules/index.ts   the list of modules; read only by src/app
src/app/               routes only: short entry points that compose core and modules
  (app)/brands/[brandId]/layout.tsx              brand header and module tabs
  (app)/brands/[brandId]/(affiliate)/layout.tsx  guard for every affiliate screen
  site/[host]/         the public brand site (affiliate module)
src/architecture.test.ts  fails if core imports a module or modules import each other
src/middleware.ts      routing by domain, and sessions
```

### Commands

```bash
npm install
npm run test:all    # every test; needs Docker Desktop running. Run before handing work over
npm test            # unit tests (104)
npm run typecheck
npm run build
npm run dev
./scripts/test-db.sh   # database tests; needs local PostgreSQL and a superuser
```

### Environment

`.env.local`, never committed:

```
NEXT_PUBLIC_SUPABASE_URL=https://ktucieqhbkqktomigrsz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
ADMIN_HOSTS=localhost,127.0.0.1        # optional; *.vercel.app is always an admin host
CLICKBANK_API_KEY=<ClickBank API key>  # temporary; per-brand credentials go in the connections table (C-05) when that screen is built.
                                       # The connection row with secret_ref 'env:CLICKBANK_API_KEY' names the one client this key belongs to.
```

The service role key is not used yet. When agents need it, it goes in server-only environment variables and is never exposed to the browser or committed.

### How the public site is served

- On an admin host, the application is served, and a brand's site can be previewed at `/site/<domain>`. Admin hosts are `affiqube.com` (the platform's own domain), localhost, `*.vercel.app`, and anything in `ADMIN_HOSTS`.
- On any other host, the request is treated as a brand's own domain and its site is served from the root.
- Visitors have no table access. They use four `SECURITY DEFINER` functions: `public_brand`, `public_pages`, `public_page`, `record_click`. Each serves only brands with the affiliate module.

### Rules enforced in the database

- An offer cannot be approved without an approved rules record.
- A tracked link cannot be created for an unapproved offer.
- A page with no content cannot be published.
- An offer page needs an approved offer.
- Offer pages and articles need all four standard pages published first.
- Scoring weights must total 100.
- Every tracked link has a globally unique 8-character tracking code; the click redirect adds it as `tid`.
- An imported transaction (network, receipt, type, time) is stored once.
- Only the owner and operators can write sales; client roles read their own client's sales only.
- The server's ClickBank key can be assigned to only one client.
- A brand without the affiliate module cannot have offers, offer figures, rules records, tracked links, or site pages added or changed; deletes are allowed (T-07).
- Only the owner and operators can change a brand's business type; each change is audited.
- Every row's `client_id` matches the client of the brand, offer, and link it points to (composite foreign keys, 0006). A sale keeps its client when its brand, offer, or link is deleted.
- Changes to configuration, offers, rules, connections, and page publishing are written to `audit_log`, which cannot be updated or deleted.

## Offer scoring

`scoreOffer` in `src/core/scoring/score.ts` returns a score out of 100, a break-even cost per click, a channel (`paid`, `organic`, `reject`, `needs_data`), and a plain-language explanation.

| Parameter | Weight | Source |
| --- | --- | --- |
| Earnings per click | 25 | Marketplace |
| Payout per sale | 15 | Marketplace |
| Conversion rate | 15 | Marketplace |
| Compliance risk | 15 | Rules record |
| Gravity | 10 | Marketplace |
| Seller restrictions | 10 | Rules record |
| Recurring commission | 5 | Marketplace |
| Refund rate | 5 | Marketplace or seller |

Weights and thresholds live in `scoring_configs` (brand, then client, then platform default). Missing figures stay missing and are reported; they are never treated as zero. A score is provisional until both rules-record parameters are known.

Reference results, used in the tests: Brain Training for Dogs (payout 42.25, conversion 0.40%, EPC 0.17, gravity 14.92) scores 48, organic. An offer with no measurable sales is rejected.

The lesson behind the model: low-payout affiliate offers do not cover the cost of paid clicks, so the platform must say so plainly and steer them to free traffic.

## Story status

Story IDs are stable. Reference them in commits, code comments, and tests. The full story bank, with acceptance tests, should be saved as `docs/user-stories.md`.

The story bank of 13 October 2026 in `docs/user-stories.md` adds the dropshipping, wizard, and other new stories with their workstream and release. The table below covers the stories built or started so far; for totals and stories not listed, see the story bank.

| ID | Story | Priority | Status |
| --- | --- | --- | --- |
| T-01 | Clients with one or more brands, kept separate | Must | Done |
| T-02 | Role-based access enforced in the database | Must | Done |
| T-03 | Client admin invites own users | Should | Not started |
| T-04 | Owner master access with client switcher | Must | Done |
| T-05 | Two-factor sign-in for admin roles | Should | Not started |
| T-06 | Audit log of publishing and spending actions | Must | Done |
| T-07 | Business type switches a brand's modules on | Must | Partial: built in increment 5; walkthrough pending; the wizard re-run waits for W-02 |
| C-01 | Brand profile | Must | Partial: business details and headline; no colours, logo, voice |
| C-02 | Budget caps per brand and campaign | Must | Not started (Slice 2) |
| C-03 | Rules record per offer | Must | Done in the database; no screen for rule text or banned claims |
| C-04 | Compliance templates replicated to each site | Must | Done |
| C-05 | Connection settings with secrets kept server-side | Must | Partial: table and access rules; no vault or screen |
| C-06 | Approval mode per action type | Must | Partial: table and seed; agents must enforce it |
| C-07 | Guardrail thresholds per brand | Must | Not started (Slice 2) |
| C-08 | Scoring weights in configuration | Must | Partial: stored, validated, audited; no editing screen |
| O-01 | Client chooses niche from scored suggestions or enters own | Must | Partial: free-text niche; no scored suggestions |
| O-07 | Client chooses platforms from a recommended list | Must | Partial: fixed reasons, not niche-specific |
| O-02 | Record an offer with dated figures | Must | Done |
| O-03 | Weighted score with plain-language explanation | Must | Done |
| O-08 | Client submits own product by affiliate link | Must | Partial: manual form; no automatic collection from the link |
| O-04 | Agent drafts the rules record from seller terms | Should | Not started |
| O-05 | Select and approve offers before content | Must | Done |
| O-06 | Tracked link per channel and variant | Must | Done |
| S-01 | Site per brand on its own domain | Must | Partial: routing done; brands are created in SQL |
| S-02 | Agent drafts the offer page | Must | Not started: pages are written by hand from a starter |
| S-03 | Draft, approve, publish flow with preview | Must | Done |
| S-04 | Standard pages exist before offer pages publish | Must | Done |
| S-05 | Home page lists active offers | Must | Done |
| S-06 | Articles | Must | Done |
| S-07 | Tracked redirect recording each click | Must | Done |
| S-08 | Email sign-up with recorded consent | Should | Not started |
| S-09 | Daily link and content check | Should | Not started |
| S-10 | Version history with rollback | Should | Not started |
| S-11 | Hosted checkout for own digital products | Could | Not started |
| K-01 | Agent writes ad copy variants | Must | Not started (Slice 2) |
| K-02 | Static ad designs from the brand design system | Must | Not started (Slice 2) |
| K-03 | Generated images through a connected tool | Should | Not started |
| K-04 | Short video creatives | Could | Not started |
| K-05 | Compliance check on every creative and page | Must | Partial: wording check on pages; not yet on ads or platform policy |
| K-06 | Creative library | Should | Not started |
| M-01 | Connect a Meta ad account by partner access | Must | Not started (Slice 2) |
| M-02 | Agent drafts a paused campaign | Must | Not started (Slice 2) |
| M-03 | Approval activates the campaign | Must | Not started (Slice 2) |
| M-04 | A/B tests changing one element | Must | Not started (Slice 2) |
| M-05 | Conversion event verified before launch | Must | Not started (Slice 2) |
| M-06 | TikTok and Pinterest campaigns | Could | Not started |
| G-01 | Hourly performance pull | Must | Not started (Slice 2) |
| G-02 | Automatic pause at cap or threshold | Must | Not started (Slice 2) |
| G-03 | Alerts by email and phone | Must | Not started (Slice 2) |
| G-04 | Budget increase recommendations | Should | Not started |
| G-05 | Pause weak ads by rule | Should | Not started |
| G-06 | Daily tracking health check | Should | Not started |
| R-01 | Content calendar | Should | Not started |
| R-02 | Agent drafts articles | Must | Not started: articles are written by hand |
| R-03 | Pins and scripts from each article | Should | Not started |
| R-04 | Scheduled social posting | Could | Not started |
| P-01 | Import sales and commissions from the network | Must | Partial: manual import button on the results page; daily schedule is future work. Untested against live sales. |
| P-02 | Spend and revenue combined per brand and offer | Must | Done |
| P-03 | Dashboard filtered by brand, date, and role | Must | Done: per-brand results page with date range selector |
| P-04 | Weekly written summary | Should | Not started |
| P-05 | Summary emailed to client | Should | Not started |
| P-06 | CSV export | Could | Not started |
| P-07 | Cross-client comparison | Could | Not started |
| D-01 | Connect a Shopify store | Should | Not started |
| D-02 | Shopify revenue in reporting | Should | Not started |
| D-03 | Agent drafts Shopify listings | Could | Not started |
| V-01 | Client onboarding checklist | Should | Not started |
| V-02 | Client offboarding | Should | Not started |
| V-03 | Client invoices | Could | Not started |

## What to build next

Follow "Build order" in the architecture section and the release plan in `docs/user-stories.md`. The earlier affiliate-only order (drafting agent as increment 5, management screens as increment 6) is replaced: the drafting agent and offer rules screen are now release R3, and Meta campaigns are R8.

## How to work in this repository

- **Small increments.** Each one ends with tests passing and a short list of what the owner must verify by hand.
- **Tests are required.** Pure logic gets unit tests. Every database rule gets a test in `supabase/tests`. Prove that a test fails when the protection is removed.
- **End-to-end tests.** Every increment adds end-to-end tests in `e2e/` for its acceptance rows. Work is handed to the owner only when `npm run test:all` passes. The tests run only against the local test stack; never point them at the hosted project.
- **Embedded queries name their foreign key** when two keys link the same tables (since 0006, most do): `offer_metrics!offer_metrics_offer_id_fkey(*)`, not `offer_metrics(*)`. Check the query's `error`; do not show an empty list when a query failed.
- **Migrations are numbered and never edited after they are applied.** Add a new file. Provide a verify query the owner can run in the Supabase SQL editor.
- **Security lives in the database.** Do not rely on middleware or the interface to protect data. New tables get row-level security and a test.
- **Never commit secrets,** and never ask the owner to paste a service role key, database password, or API key into a chat.
- **Ask before anything that spends money or publishes publicly.** Changes to public legal text need the owner's review.
- **Be exact about what was verified.** State what was tested, how, and what was not. The owner runs a short walkthrough against the real Supabase project after each increment.
- **Plain language in the interface.** The clients are not marketers. Explain scores and refusals in sentences they can act on.
- **Trace to stories.** Name the story IDs in commits and in the acceptance table in `README.md`, and update the status table in this file.
- **TypeScript stays on version 5.** Next.js 15 does not read the project settings correctly with TypeScript 7.

## Working with the owner

- He prefers structured, implementation-ready output with explicit traceability, and to learn by doing.
- He is technical (Next.js, Supabase, Claude API) but works on Windows with PowerShell; give commands in that form, and quote paths that contain spaces.
- Repository on his machine: `C:\Amit\Business_Plan\DigitalMarketingService\code\platform\affiliate-automation-platform`.
