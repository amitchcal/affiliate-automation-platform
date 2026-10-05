# Marketing Automation Platform: project context

This file gives Claude Code the context for this repository. Read it before making changes. It records what the product is, what has been decided, what is built, and how work is expected to be done.

Last updated: 5 October 2026, after increment 3.

## What this product is

A multi-tenant platform that runs affiliate and digital marketing for several brands and clients. Agents do the work; people set the limits in configuration and approve what matters.

- **Owner:** Amit Chakraborty, trading as Vividha Marketing (Kolkata, India).
- **Purpose:** first to run Amit's own brands, then to deliver digital marketing as a service to other clients.
- **First client:** Amit himself. Client "Vividha Marketing", brand "AffiQube" on `affiqube.com`, US audience, software and productivity niche.
- **Why it exists:** each extra Shopify store costs a monthly fee, and an affiliate site uses little of what Shopify offers. This platform hosts content and affiliate brands itself. Shopify stays for dropshipping only.

A separate Shopify store, AffilyVault (`affilyvault.com`), was built by hand before this platform. It is not in this repository. It is the reference for how a compliant affiliate site should read, and may move onto the platform later.

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

## Compliance rules

These take priority over conversion. They come from ClickBank's promotional guidelines and US advertising rules, and they apply to every page and ad an agent writes.

1. Disclose the affiliate relationship clearly, on the page and near the links.
2. No fake reviews or testimonials. Pages are overviews based on the seller's published information, and say so, unless the product was really used.
3. No unsubstantiated superlatives ("best", "#1", "top-rated").
4. No false scarcity or urgency.
5. No false or unprovable claims, including health and results claims. Attribute claims to the seller.
6. Do not appear to be the seller. State that the site is an independent affiliate.
7. No content aimed at children under 13. Address parents and owners.
8. No spam. Never buy through the brand's own affiliate link.

Each seller also has its own rules, stored per offer in `offer_rules`. Example already met: one seller forbids bidding on its brand name in paid search and forbids a Facebook page named after the product.

In code: `src/lib/compliance.ts` checks wording before publishing. It is a first line of defence, not legal review. Extend it; do not weaken it. Standard pages are exempt because they are the compliance text itself.

Do not put a product's price on a page. Link to the seller for the current price.

## What is built

| Increment | Contents | Status |
| --- | --- | --- |
| 1 | Schema with row-level security, approval and audit triggers, offer scoring engine | Done, verified on the owner's Supabase project |
| 2 | Sign-in, client and brand screens, niche and platform choice, offer intake, scoring, approvals | Done, verified on the owner's Supabase project |
| 3 | Compliance templates, site pages with draft and publish, wording check, public brand site by domain, tracked links with click recording | Done, tested end to end locally. Owner still to run `0003_site.sql` and the walkthrough |

### Layout

```
supabase/migrations/   0001_core.sql, 0002_seed_first_client.sql, 0003_site.sql
supabase/tests/        access_rules.sql, site_rules.sql, local_bootstrap.sql, local_grants.sql
supabase/verify.sql, verify_site.sql      checks to run in the Supabase SQL editor
scripts/test-db.sh     runs the database tests on a local PostgreSQL
src/scoring/           scoring engine: config.ts, score.ts
src/lib/               scoring-config, offers, markdown, compliance, site, public-site, supabase clients
src/middleware.ts      routing by domain, and sessions
src/app/login          sign-in
src/app/(app)/         the application, behind sign-in
src/app/site/[host]/   the public brand site
```

### Commands

```bash
npm install
npm test            # unit tests (43)
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
```

The service role key is not used yet. When agents need it, it goes in server-only environment variables and is never exposed to the browser or committed.

### How the public site is served

- On an admin host, the application is served, and a brand's site can be previewed at `/site/<domain>`.
- On any other host, the request is treated as a brand's own domain and its site is served from the root.
- Visitors have no table access. They use four `SECURITY DEFINER` functions: `public_brand`, `public_pages`, `public_page`, `record_click`.

### Rules enforced in the database

- An offer cannot be approved without an approved rules record.
- A tracked link cannot be created for an unapproved offer.
- A page with no content cannot be published.
- An offer page needs an approved offer.
- Offer pages and articles need all four standard pages published first.
- Scoring weights must total 100.
- Changes to configuration, offers, rules, connections, and page publishing are written to `audit_log`, which cannot be updated or deleted.

## Offer scoring

`scoreOffer` in `src/scoring/score.ts` returns a score out of 100, a break-even cost per click, a channel (`paid`, `organic`, `reject`, `needs_data`), and a plain-language explanation.

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

Totals: 68 stories; 41 Must, 19 Should, 8 Could.

| ID | Story | Priority | Status |
| --- | --- | --- | --- |
| T-01 | Clients with one or more brands, kept separate | Must | Done |
| T-02 | Role-based access enforced in the database | Must | Done |
| T-03 | Client admin invites own users | Should | Not started |
| T-04 | Owner master access with client switcher | Must | Done |
| T-05 | Two-factor sign-in for admin roles | Should | Not started |
| T-06 | Audit log of publishing and spending actions | Must | Done |
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
| P-01 | Import sales and commissions from the network | Must | Not started: next |
| P-02 | Spend and revenue combined per brand and offer | Must | Not started: next |
| P-03 | Dashboard filtered by brand, date, and role | Must | Not started: next. Click counts exist per link |
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

In this order, unless the owner says otherwise.

1. **Increment 4: results.** ClickBank sales import (P-01), matched to tracked links by the tracking parameters on each link; combined metrics per offer and channel (P-02); a dashboard limited by role (P-03). Read-only, so no spend risk. The owner has ClickBank API access; keys go in server environment variables.
2. **Increment 5: drafting agent.** An agent that drafts an offer page (S-02) and articles (R-02) from the seller's published facts and the offer's rules record, saves them as drafts, and never publishes without the approval mode allowing it. Add the screen for rule text and banned claims (C-03) first, since the agent depends on it.
3. **Increment 6: management screens.** Create clients and brands (S-01), edit scoring weights (C-08), fuller brand profile (C-01).
4. **Slice 2: paid campaigns.** Budget caps, ad copy and designs, Meta campaigns, guardrails. Needs Meta API access, which the owner must apply for; it takes time.

## How to work in this repository

- **Small increments.** Each one ends with tests passing and a short list of what the owner must verify by hand.
- **Tests are required.** Pure logic gets unit tests. Every database rule gets a test in `supabase/tests`. Prove that a test fails when the protection is removed.
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
