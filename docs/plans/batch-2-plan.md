# Batch 2 plan: go-live gate (S-01, S-08)

Prepared 17 October 2026. Status: **built on 17 October 2026 (steps 1 to 6) on branch `batch-2`, with the owner's answers and additions (section 11) and his review of 0010 to 0012 (section 13). Sabotage report: `batch-2-sabotage-report.md`. Nothing applied to the hosted project.** Batch 1 (increment 6) is built and committed on `increment-6`. Its 0008 and 0009 are not yet applied on Supabase.

Gate: starts after batch 1. **Reserved migration numbers: 0010, 0011, 0012.** Batch 1 used 0008 and 0009.

---

## 1. Goal and acceptance criteria

**Goal.** A brand's site can go live on its own domain only when it is ready: domain proven, standard pages published, business details complete. A live site can invite visitors to join the brand's email list, with their consent recorded exactly. Until a site is live, the public cannot see it.

### S-01: site per brand on its own domain from a template

Story bank: "As the owner, I want to create a site for a brand on its own domain from a template, so that a new brand is live quickly." Acceptance: "One deployment serves several domains, each showing only its brand."

Today (increment 3): routing by domain works, and a brand's site is served to anyone as soon as the brand row exists. There is no domain check and no notion of "live". Brands are created in SQL; the start-a-brand screen is W-01, batch 3.

| ID | Criterion |
|---|---|
| S01-1 | **Set up site** on the brand's Site and links tab creates the brand's site from the standard template: the site record (draft) and the four standard pages as drafts, filled from the business details. It is refused, with the missing items named, while business details are incomplete. |
| S01-2 | The owner or an operator adds a **host** to the brand, with its purpose: **Site** (pages and links, for example `affilyvault.com`, `www.affilyvault.com`) or **Links only** (tracked-link redirects only, for example `go.affilyvault.com`, while the pages stay on Shopify until S-12). A host can belong to one brand only. |
| S01-3 | **Check domain** proves the host: (a) a TXT record `_affiqube.<host>` holds the host's verification code, and (b) the host points at the platform (a CNAME or A record in the configured list). The result is stored with the time and a plain reason. Only the server's check can mark a host verified, never a request from the browser. |
| S01-4 | **Go live** is refused by the database unless every item on the launch checklist passes: affiliate module on; business details complete; all four standard pages published; the Privacy Policy page on the current template wording if email sign-up is on; at least one verified Site host. The refusal names each failing item in plain words. |
| S01-5 | Only the owner and operators can go live; the owner, operators, and client admins can **Take offline**. Both are audited. Taking offline needs no checklist. |
| S01-6 | On a host that is not a verified host of a live site, visitors get "This site is not available" (404), with no brand name, page, or link shown. A **Links only** host serves `/go/<code>` redirects (recording the click) and nothing else. |
| S01-7 | **One deployment serves several domains, each showing only its brand**: two live brands on two hosts each show only their own name, pages, and links, tested end to end. |
| S01-8 | **Preview** of a site that is not live (`/site/<domain>` on the admin host) needs a signed-in person with access to that brand's client. Today it is public. Visitors and other clients get the "not available" page. |

### S-08: email sign-up with recorded consent

Story bank: "As the owner, I want an email sign-up form with recorded consent, so that I can build a subscriber list lawfully." Acceptance: "Each subscriber record stores the consent text and time."

| ID | Criterion |
|---|---|
| S08-1 | The owner or an operator turns **Email sign-up** on for a live affiliate site. The form then appears on the home page and in the footer of every page. Turning it on is refused until the Privacy Policy page uses the current template wording (0012). |
| S08-2 | The form has an Email field, an **unticked** consent checkbox showing the brand's consent wording, and a **Sign up** button. Without the tick, nothing is stored and the visitor is told why. |
| S08-3 | Each subscriber record stores the email (normalised), the **exact consent wording shown** (copied, not referenced), its version, the time, the page and host it was given on, and the brand and client. The wording comes from the database for that brand. A request cannot supply its own wording. |
| S08-4 | The visitor sees the same message whether the address is new or already on the list. The database stores one record per brand and email. A repeat sign-up does not change the original consent record. |
| S08-5 | Visitors cannot read, change, or delete subscriber records. They have one function, `subscribe`, which works only for a live site with sign-up on. |
| S08-6 | The owner, operators, and the client's admins see the brand's subscribers (email, date, page, status). Viewers see the count only. Other clients see nothing. |
| S08-7 | The owner or an operator can **delete** a subscriber (a request to be forgotten). The row goes; the audit entry records that a subscriber was deleted, from which brand and when, but **not the email address**. |
| S08-8 | Abuse limits: a hidden honeypot field, and at most 30 sign-ups per brand per minute. Over the limit, the visitor sees "Please try again in a minute." Nothing is stored. |
| S08-9 | **No email is sent in this batch.** Subscribers are stored as **Waiting for confirmation** (double opt-in, see Q3). The confirmation email arrives with the email platform (E-02, batch 16). The screen says so. |

---

## 2. What exists, and what we build

| Need | Exists | We build |
|---|---|---|
| Routing by host | `src/middleware.ts` (admin hosts, then brand site by host); `public_*` functions look up `brands.domain` | Public functions look up verified hosts of live sites; links-only hosts; "not available" page |
| Standard pages from templates | `createStandardPages` on the Site and links tab; `compliance_templates` | Wrapped in **Set up site**, which also creates the site record |
| Domain proof | None | `brand_domains` table; a server-only DNS check; the result is written only with the service role, after the database has said the person may check this host |
| Live or not | None (every brand with the affiliate module is public) | `aff_sites.status`: draft, live, offline; a database-enforced checklist |
| Consent wording | None | `consent_texts`, versioned, owner-reviewed (0011) |
| Subscribers | None | `subscribers` (core: E-01 extends it to stores), `subscribe()` for visitors |
| Privacy Policy wording for sign-up | One line: "Your email address, if you give it to us. Only when you write to us or sign up for updates." | New section in the template (0012); existing pages unchanged until re-published, as with 0007 |

**Layers** (CLAUDE.md, Architecture):
- **Core:** `brand_domains` (the dropshipping domain step, wizard step 6, will use it too), `consent_texts`, `subscribers`, the DNS check, the subscriber list screen.
- **Affiliate:** `aff_sites` (draft, live, offline; sign-up on or off), the checklist, the public form, the "not available" page.
- Core does not reference `aff_sites`. The sign-up function lives in the affiliate module's migration section and calls core's insert.

**Service role key.** Batch 1 uses it only to send invitation emails. This batch adds one use: writing a domain check's result. It runs server-only, after `can_check_domain(id)` has returned true for the signed-in person. This is the same pattern as invitations.

---

## 3. Data changes (reserved: 0010, 0011, 0012)

All three files are written in build step 1. **Planned pause after step 1** (section 7): 0010 changes access rules (the public functions and preview), 0011 holds personal data and consent wording, and 0012 changes compliance text.

### 0010_sites_and_domains.sql (S-01): access rules

- **`brand_domains`** (core; changed by section 11, additions 1, 2 and 4):
  - columns: `id`, `client_id`, `brand_id`, `host` (lower-case ASCII or punycode, syntax-checked by a constraint), `purpose` (`site` | `links`), `verification_code` (random per row, 32 hex characters, shown to the owner for the TXT record), `status` (`pending` | `verified`), `verified_at` (last successful check), `checked_at`, `check_ok`, `check_reason`, `failed_since` (set by a failed check after a success; cleared by the next success), `created_by`, `created_at`;
  - unique (`brand_id`, `host`); **at most one verified row per host across all clients** (partial unique index); adding or verifying a host that another client has verified is refused (`domain_taken`). Pending rows of different clients do not block each other, so nobody can squat a domain without proving it;
  - composite foreign key `(brand_id, client_id)` to brands, as in 0006;
  - row-level security: read with `has_client_access`; insert and delete with `can_manage`. **No update policy**: status changes only through `record_domain_check`.
- **`can_check_domain(domain_id)`**: true for `can_manage` of the host's client. The server asks it before any DNS lookup.
- **`record_domain_check(domain_id, verified boolean, reason text)`**: executable by `service_role` only; audited.
- **`aff_sites`** (affiliate):
  - columns: `brand_id` (primary key), `client_id`, `template_key` (`standard`), `status` (`draft` | `live` | `offline`), `signup_enabled`, `went_live_at`, `went_live_by`, `updated_at`;
  - read with `has_client_access`; no direct writes. Changes go through `set_up_site`, `go_live`, `take_offline`, `set_signup`.
- **`site_launch_checklist(brand_id)`**: returns one row per item (`key`, `passed`, `reason`). It is shared by the screen and by `go_live`, so the two can never disagree.
- **`go_live(brand_id)`**:
  - `can_manage`, so the owner and operators, at aal2 through the 0009 helpers;
  - refuses with `site_not_ready` and the failing keys if any checklist item fails, and **re-checks that a Site host is verified** (verified within the last 30 days; see Q5);
  - audited.
- **`take_offline(brand_id)`**: `can_approve`; audited.
- **Public functions** (`public_brand`, `public_pages`, `public_page`, `record_click`) are redefined (`create or replace`, same signatures):
  - a site host serves only if the host is verified and the brand's `aff_sites.status = 'live'`;
  - `record_click` also serves verified **links** hosts of a brand with the affiliate module, live or not, so `go.affilyvault.com` can work while the pages stay on Shopify.
- **New `preview_brand`, `preview_pages`, `preview_page`**, for `/site/<domain>` on admin hosts: they require `has_client_access(brand's client)`. Visitors get nothing.
- **Backfill:**
  - every brand with the affiliate module gets an `aff_sites` row with status `draft`;
  - each brand's existing `brands.domain` becomes a `site` host with status `pending`.
  - **Nothing is live after 0010 until someone checks the domain and goes live.** `verify_sites.sql` lists any brand whose public site would stop being served (see Q2).
- One transaction; `search_path = public, pg_temp` on every function; safe to run twice.

### 0011_subscribers_and_consent.sql (S-08): personal data and consent wording

- **`consent_texts`** (core):
  - columns: `key` (`email_signup`), `version` (integer), `body` (with `{{brand}}`), `created_at`; unique on (`key`, `version`); the highest version is current;
  - readable by signed-in users; written only by migrations.
  - The first version is in section 5 for **owner review**.
- **`subscribers`** (core):
  - columns: `id`, `client_id`, `brand_id`, `email` (normalised; checked), `status` (`pending` | `confirmed` | `unsubscribed`), `consent_text` (the filled wording, verbatim), `consent_key`, `consent_version`, `consented_at`, `source_host`, `source_page`, `confirmed_at`, `unsubscribed_at`;
  - unique (`brand_id`, `email`); composite foreign key to brands.
  - **No IP address and no browser details are stored** (see Q4).
- **Row-level security:**
  - select with `can_approve` (owner, operators, the client's admin);
  - **viewers get no rows**, and `subscriber_count(brand_id)` gives them the number;
  - delete with `can_manage`; no insert or update policies.
- **`subscribe(p_host, p_email, p_page, p_consented boolean, p_honeypot text)`**: `SECURITY DEFINER`, executable by `anon` and `authenticated`. It:
  - finds the live site by verified host with `signup_enabled`;
  - refuses `signup_unavailable` otherwise;
  - refuses `signup_no_consent` when the box is not ticked;
  - validates the email;
  - **if the honeypot is filled, returns success and stores nothing**;
  - applies the per-brand rate limit (`signup_rate_limited`);
  - fills the current consent wording for the brand;
  - inserts `on conflict (brand_id, email) do nothing`;
  - returns nothing that tells a new address from a known one.
- **`set_signup(brand_id, on)`**: `can_manage`, audited. Turning it on requires a live site and a current Privacy Policy page (see 0012).
- **Delete audit:** a trigger writes `subscriber_deleted` with the subscriber id, brand, client, and time, and **no email** (`before` is not copied for this table). The audit trigger from 0001 is not used here, because it would copy the email.

### 0012_privacy_template_signup.sql (S-08): compliance text

- Changes the Privacy Policy template's email line into a section on email sign-up (wording in section 5, **owner review**), and records `compliance_templates.version` (new column, default 1; this template becomes 2).
- `site_pages` gets `template_version` for standard pages, set when created from a template.
- The checklist item "Privacy Policy current" passes when the published privacy page's `template_version` equals the template's. Existing pages are copies and are not changed. The owner re-creates or edits the page and publishes it, as with 0007.
- `verify_privacy_signup.sql` lists pages on the old wording.

**Verify queries** (one per migration, for the Supabase SQL editor; every row "ok", information rows marked):
- `verify_sites.sql`: tables, policies, no update policy on `brand_domains`, `record_domain_check` executable only by `service_role`, public functions require live and verified, preview functions require access. Information rows: brands now not served publicly, and hosts pending.
- `verify_subscribers.sql`: no visitor access to `subscribers`; `subscribe` the only visitor function; delete audit has no email; consent version 1 present.
- `verify_privacy_signup.sql`: template version 2 contains the new section once; pages still on version 1 (information).

---

## 4. Security and access rules

| Action | Owner | Operator | Client admin | Viewer | Visitor |
|---|---|---|---|---|---|
| Set up site, add or remove host, check domain | yes | yes | no | no | no |
| Go live | yes | yes | no (Q1) | no | no |
| Take offline | yes | yes | yes | no | no |
| Turn sign-up on or off | yes | yes | no | no | no |
| See subscribers (emails) | yes | yes | yes | count only | no |
| Delete a subscriber | yes | yes | no | no | no |
| Preview a site that is not live | yes | yes | yes | yes | no |
| See a live site | yes | yes | yes | yes | yes |
| Sign up on a live site with sign-up on | n/a | n/a | n/a | n/a | yes |

Rules:
1. **Two-factor applies.** Every write above goes through the 0009 helpers, so a password-only session of a required role does nothing.
2. **A host is proven by DNS, checked by the server.** The browser cannot set `verified`: there is no update policy, and `record_domain_check` belongs to `service_role` only. The DNS lookup happens only after `can_check_domain` is true. The lookup resolver is server-only. In tests, a fake resolver is allowed only when the application points at the local stack, and the same guard as the service role key enforces this.
3. **Going live is checked in the database,** by the same checklist the screen shows. A crafted request cannot skip an item.
4. **Not live means not public.** The public functions return nothing for a draft or offline site, and the preview functions need client access. Previews stop being public.
5. **Visitors write only through `subscribe`,** which takes no wording, no client, and no brand from the request: all of that comes from the verified host.
6. **No enumeration.** `subscribe` and the form respond identically for new and known addresses, and for a filled honeypot.
7. **Personal data minimised.** No IP address, browser details, or name. Email and consent record only.
8. **Deletion is real.** Deleting removes the row. The audit entry keeps no email.
9. **Audit.** These are written to `audit_log`: host added or removed, domain check result, set up site, go live, take offline, sign-up on or off, subscriber deleted.
10. **Compliance.** The consent wording and the Privacy Policy section are compliance text. They are stored as migrations, reviewed by the owner before building on them (pause), and never edited by agents. The form's fixed text is checked by `compliance.ts` in a unit test (no superlatives, no urgency).

---

## 5. Screens and wording

All public wording is in American English. Admin wording is plain.

### Site and links tab (affiliate), new sections at the top

**Launch checklist**: one line per item, a tick or a cross, and the reason when it fails:

| Key | Passes when | Failing reason shown |
|---|---|---|
| module | Affiliate marketing is on | "Affiliate marketing is not switched on for this brand." |
| details | Operator name, address, contact email filled | "Business details are missing: {items}. Fill them in on the Overview tab." |
| standard_pages | Four standard pages published | "Publish the standard pages first: {titles}." |
| privacy_current | (only when sign-up is on or being turned on) privacy page on the current wording | "The Privacy Policy page uses older wording. Re-create it from the template, review it, and publish it." |
| domain | At least one Site host verified in the last 30 days | "No verified domain yet. Add the DNS records below, then press Check domain." |

Buttons: **Set up site** (when there is no site record), **Go live** (owner and operators, enabled when every item passes), **Take offline**. Status line: "Draft: not visible to the public." / "Live since {date} at {hosts}." / "Offline since {date}: not visible to the public."

**Domains:** a list of hosts with purpose, status, last check, and reason. **Add domain** form: host, purpose (Site / Links only). For each pending host, the two DNS records to add:
- "Type TXT, name `_affiqube.{host}`, value `{code}`"
- "Type CNAME, name `{host}`, value `{target}`", or for an apex domain, "Type A, value `{ip}`"

Then **Check domain**. Check results:

| Result | Message |
|---|---|
| Verified | "{host} is verified." |
| TXT missing | "The TXT record `_affiqube.{host}` was not found. DNS changes can take up to a few hours; try again later." |
| TXT wrong | "The TXT record `_affiqube.{host}` has a different value. It must be exactly the code shown." |
| Not pointing here | "{host} does not point at Affiqube yet. Add the CNAME (or A) record shown." |
| Host taken | "{host} is already used by another brand." |
| Not allowed | "Only the owner and operators can add or check domains." |

**Email sign-up** (shown when the site is live):
- On/off switch, with "No emails are sent yet. Sign-ups wait for confirmation until the email platform is connected."
- Count, and for the owner, operators, and admins, a list: email, signed up on, page, status (Waiting for confirmation), and **Delete** (owner and operators). Delete asks "Delete {email}? This cannot be undone. Use this when the person asks to be forgotten."

### Public site

- **"Not available" page** (404): "This site is not available." Nothing else, so nothing is revealed.
- **Sign-up form** (home page and footer):
  - Heading: "Get updates from {brand}"
  - Email field: label "Email"
  - Checkbox, unticked: the consent wording below
  - Button: "Sign up"
  - Done (any address, new or known): "Thank you. You're on the list."
  - Not ticked: "Tick the box to agree to receive emails, or leave the form."
  - Bad email: "Enter a valid email address, for example name@example.com."
  - Too many: "Please try again in a minute."
  - Unavailable: "Sign-up is not available right now."

### Consent wording, version 1 (0011): **for owner review**

> Yes, email me updates from {{brand}}: new guides and product overviews. I can unsubscribe at any time. {{brand}} will not sell my email address. See the Privacy Policy.

("Privacy Policy" links to the brand's privacy page.)

### Privacy Policy template, version 2 (0012): **for owner review**

It replaces the line "**Your email address, if you give it to us.** Only when you write to us or sign up for updates." with:

> - **Your email address, if you write to us.** We use it only to reply.
> - **Your email address, if you sign up for updates.** We keep your email address, the exact wording you agreed to, the page you signed up on, and the time. We use your address only to send the updates you asked for, and we do not sell or share it. Every email will include a way to unsubscribe. You can also unsubscribe, or ask us to delete your address, by writing to {{email}}. When we start sending emails, our email provider will store your address on our behalf.

---

## 6. Tests

### Unit (Vitest)
- `evaluateDnsCheck(records, code, targets)`: TXT present, wrong, missing; CNAME to a target; A record in the list; apex without CNAME; trailing dots and case.
- Host normalisation and validation: no scheme, no path, no port, no IP address, no admin host, `www.` handling.
- The checklist reasons: every key has its message.
- Refusal codes of 0010 and 0011: every code has a message. The same scan as the 0008 and 0009 tests.
- The fake resolver is refused unless the application points at the local stack (guard test).
- The public form's fixed wording passes `compliance.ts`.

### Database (`supabase/tests/site_launch_rules.sql`, `subscriber_rules.sql`, `privacy_signup_rules.sql`)
- **Hosts:**
  - read by the client's members, written by owner and operators only;
  - another client cannot read or add;
  - **no one can update `status`** (owner included);
  - `record_domain_check` refused for `authenticated`, allowed for `service_role`;
  - host unique across brands.
- **Go live:**
  - each checklist item failing on its own refuses with its key;
  - all passing goes live;
  - a client admin is refused; at aal1 refused;
  - audited.
- **Take offline:** allowed for the client admin; audited.
- **Public functions:**
  - draft, offline, unverified host, and verified host of a draft site each return nothing;
  - live and verified returns the brand;
  - a links host: `record_click` works and `public_page` returns nothing;
  - two live brands each see only their own pages.
- **Preview:** the client's members yes; another client no; `anon` no.
- **`subscribe`:**
  - stores the filled wording of the current version, the time, the host, and the page;
  - refused without consent;
  - refused when not live or sign-up off;
  - a second sign-up leaves the first record unchanged and returns the same result;
  - honeypot stores nothing;
  - rate limit at 30 per minute per brand;
  - `anon` cannot select, insert, update, or delete `subscribers`.
- **Subscriber visibility:** owner, operators, and admin see emails; viewers see none, and `subscriber_count` gives them the number; another client sees nothing.
- **Delete:** owner and operators only; the audit row has no email anywhere in it.
- **Sign-up on:** refused while the privacy page is on template version 1; allowed after the version 2 page is published.
- **0012:** the template contains the new section once, the rest is unchanged, and existing pages are unchanged.
- Every suite keeps running with 0009 applied, at aal2.

### End-to-end (Playwright, local stack only, one worker)

The local test application runs with a fake DNS resolver (a file under `e2e/.run/`) and admin hosts `localhost,127.0.0.1`. Brand hosts are reached by setting the `Host` header on requests to the local server. No real DNS is used.

1. Set up site on a brand with incomplete details: refused, with the missing items. After the details are filled: draft site and four draft pages.
2. Add `site` and `links` hosts; Check domain with no records (TXT missing), with a wrong code, without the pointer, then verified; each message as worded.
3. The checklist shows every failing item. A crafted Go live request is refused with the same items. After publishing the standard pages, Go live works and the audit entry exists.
4. **Two live brands on two hosts** each show only their own name, pages, and links (S01-7).
5. A draft brand's host, an unverified host, and an unknown host each show "This site is not available", with no brand name in the response.
6. The links host: `/go/<code>` redirects and records the click; `/` shows "not available".
7. Preview: signed out, "not available"; a member of the client, the draft site; another client's admin, "not available".
8. A client admin: no Go live button, and a crafted request is refused; Take offline works; the site is then not public.
9. Sign-up:
   - turning it on is refused until the version 2 privacy page is published;
   - not ticked: refused, nothing stored;
   - ticked: stored with the wording, time, and page;
   - the same address again: the same message, one record, the original time kept;
   - the honeypot: the same message, nothing stored.
10. Subscribers list: the admin sees the email; a viewer sees the count only; the owner deletes, and the audit row has no email.

### Sabotage cases (each must turn red, then be restored)

| # | Change | Test that must fail |
|---|---|---|
| B1 | Public functions ignore `aff_sites.status` | DB draft returns nothing; e2e 5 |
| B2 | Public functions ignore host verification | DB unverified host; e2e 5 |
| B3 | An update policy on `brand_domains` for `can_manage` | DB "no one can update status" |
| B4 | `record_domain_check` granted to `authenticated` | DB grant test |
| B5 | The server writes the check result before `can_check_domain` | e2e 2 (another client's crafted check verifies a host) |
| B6 | `go_live` skips the domain item | DB checklist refusals; e2e 3 |
| B7 | `go_live` skips the standard-pages item | DB; e2e 3 |
| B8 | `go_live` allowed for `can_approve` (client admin) | DB; e2e 8 |
| B9 | Preview functions skip `has_client_access` | DB preview; e2e 7 |
| B10 | Links host serves pages | DB links host; e2e 6 |
| B11 | `subscribe` accepts wording from the request | DB "stores the filled wording of the current version" |
| B12 | `subscribe` ignores the consent tick | DB; e2e 9 |
| B13 | `subscribe` works on a draft site or with sign-up off | DB |
| B14 | A repeat sign-up updates `consented_at` | DB; e2e 9 |
| B15 | The form message differs for a known address | e2e 9 |
| B16 | Viewers can read `subscribers` | DB; e2e 10 |
| B17 | The delete audit copies the email | DB; e2e 10 |
| B18 | Sign-up on allowed with an old privacy page | DB; e2e 9 |
| B19 | The fake resolver allowed against a non-local address | unit guard test |
| B20 | The rate limit removed | DB rate limit |
| B21 | The honeypot stores the row | DB; e2e 9 |

---

## 7. Build steps (in order; each ends with its tests passing)

| Step | Content | Must pass |
|---|---|---|
| 1 | Write 0010, 0011, 0012; the three database test files; the three verify files; test stand-ins for `service_role`. **Then pause:** print the file paths for the owner's review (access rules, personal data, compliance text) | `npm run test:db` |
| 2 | After approval: the server-only DNS check (`src/core/domains/`), its resolver and test fake with guard; host validation; unit tests | `npm test` |
| 3 | Site and links tab: Set up site, Domains, Check domain, launch checklist, Go live, Take offline | `npm run test:all` |
| 4 | Public site: "not available" page, links-only hosts, preview through the preview functions; middleware changes | `npm run test:all` |
| 5 | Sign-up: public form, sign-up switch, subscribers list, delete; e2e 9 and 10 | `npm run test:all` |
| 6 | Sabotage B1–B21 in the foreground, one case at a time, with a report; README, CLAUDE.md, `how-it-works.md`, story status; the batch report | `npm run test:all` |

---

## 8. Owner's parallel track (what only Amit can do)

1. **Batch 1 first:** apply 0008 and 0009 on Supabase in the order given in the batch 1 report. 0010 must come after them.
2. **Decide which host AffilyVault goes live on in this batch** (Q2): most likely `go.affilyvault.com` as Links only, with the pages staying on Shopify until S-12.
3. **Vercel:** add each brand host to the project (Settings, Domains). The platform's check does not do this for you. Vercel then shows the exact CNAME or A record; tell me the values so the target list in configuration matches.
4. **DNS at the registrar:** add the TXT and CNAME (or A) records the Domains section shows.
5. **Review the consent wording and the Privacy Policy section** in section 5 (compliance text; legal review if you want it).
6. **Answer Q1–Q6** below.
7. Before email is sent (batch 16): the email platform and sender domain. Nothing needed now.

---

## 9. Open questions

Answered by the owner on 17 October 2026:

- **Q1.** Owner and operators go live; client admins may take offline.
- **Q2.** The platform serves nothing publicly today (the application runs on localhost only). No live domain or redirect is assumed. The owner will confirm `go.affilyvault.com` has no record pointing at the platform.
- **Q3.** Double opt-in, yes. Per-site sign-up switch, default off; the form works only when it is on. The confirmation email arrives in batch 16.
- **Q4.** No IP addresses stored.
- **Q5.** 30 days.
- **Q6.** Delete unconfirmed sign-ups after **30 days**, once confirmation exists (batch 16). **Needs the legal review (LG-05).**

## 10. Risks

| Risk | Mitigation |
|---|---|
| 0010 takes down anything served today | Backfill leaves everything draft; `verify_sites.sql` lists what would stop being served; Q2 before applying |
| DNS checks are slow or cached, and the owner sees "not found" for hours | Plain message about propagation; Check domain can be pressed again; result and time stored |
| Vercel and the platform disagree on the target record | Targets in configuration, confirmed by the owner from Vercel (parallel track 3) |
| A spam bot fills the list | Honeypot, rate limit, consent tick required; double opt-in before any email is sent (Q3) |
| Consent wording changes later | Versioned; each record keeps the exact wording it was given |
| The service role gains a second use | Server-only, after a database check, covered by sabotage B5 |
| Memory on the development machine | Sabotage and long runs in the foreground, one at a time (batch 1 lesson) |

---

## 11. The owner's additions (17 October 2026)

These override anything earlier in the plan.

### Addition 1: domain input

- The host is entered without a scheme, path, or port. The server converts it to lower-case ASCII (punycode for international names, with Node's `domainToASCII`) and checks its syntax: labels of 1 to 63 letters, digits, or hyphens, not starting or ending with a hyphen; at least two labels; at most 253 characters. The same syntax is a check constraint on `brand_domains.host`, so a crafted request cannot store anything else.
- **Refused:** IP addresses (v4 and v6, in any form the URL parser accepts), single-label names, and platform or internal names: `affiqube.com` and its subdomains, `vercel.app` and its subdomains, every admin host in `ADMIN_HOSTS`, and the reserved names `localhost`, `*.localhost`, `*.local`, `*.internal`, `*.invalid`, `*.test`, `*.example`, `*.arpa`. Message: "Enter a domain name such as example.com or go.example.com. Addresses, internal names, and Affiqube's own domains cannot be used." The database constraint refuses IP addresses and these suffixes too.
- **DNS lookups only.** The check uses Node's resolver (`resolveTxt`, `resolveCname`, `resolve4`, `resolve6`) for `_affiqube.<host>` and `<host>`. It never opens a connection to the supplied host: no HTTP request, no fetch, no redirect following. A unit test fails if `src/core/domains/` imports `fetch`, `http`, `https`, `net`, or `tls`, or calls `fetch(`.

### Addition 2: the ownership token, and one client per domain

- `verification_code` is random per row (32 hex characters from `gen_random_bytes`), so the same host added by two brands has two different codes. The check compares the TXT value with **this row's** code only.
- **Database rules, tested:** at most one verified row per host (partial unique index on `host` where `status = 'verified'`). A trigger refuses adding a host that another client has verified (`domain_taken`). `record_domain_check` refuses to verify a row while another client's row for the same host is verified (`domain_taken`). Sabotage cases B22 (index removed) and B23 (trigger skips the other-client check).

### Addition 3: unknown hosts

- A request whose Host header is not an admin host and not a served host of a live site (or a links host) gets **404 "This site is not available."** It never falls back to another brand, to the first brand, or to the application. Tested in the database (the public functions return nothing for an unknown host) and end to end (unknown host, a host that differs only by a suffix such as `affilyvault.com.evil.com`, an empty Host, and a mixed-case host of a live site, which is served because hosts are compared lower-case). Sabotage B24: the lookup matches by suffix or falls back to the first brand.

### Addition 4: a failed re-check of a live site

- A check that fails after an earlier success sets `failed_since` and `check_reason` but **does not take the site offline** in this batch. The host keeps serving (it was proven before), so a DNS hiccup does not take a brand down.
- **Warning:** the brand's Overview and Site and links tab, and the brand's row on the client page, show "Domain check failed for {host} on {date}: {reason}. The site is still live. Fix the DNS records and press Check domain." for the owner, operators, and client admins.
- **Going live again is blocked:** the checklist's domain item fails while any Site host has `failed_since` set, or has no successful check in the last 30 days.
- **Proposal for the report (not built):** when the daily check (S-09) exists, a host that fails two checks at least 24 hours apart calls `take_offline` as the system, which is allowed unattended because it reduces exposure, and alerts the owner (G-03). No scheduler is built in this batch.

### Addition 5: how a privacy template change reaches existing brands

- Standard pages are **copies** of the template, filled with the brand's details when created. 0012 changes the template only. It changes no brand's page, because legal text on a live site changes only when a person publishes it.
- Each standard page records the template version it was made from (`site_pages.template_version`, added in 0012; existing pages are set to 1).
- When a brand's Privacy Policy page is on an older version, the Site and links tab shows "A newer Privacy Policy template is available." with **Update from template**. This writes the current template, filled with the brand's details, into the page's **draft** (the published text is unchanged), and sets the draft's template version. The owner or an operator reviews the draft and publishes it. Publishing records the new version.
- Turning email sign-up on is refused until the published Privacy Policy is on the current version (`privacy_current` checklist item). `verify_privacy_signup.sql` lists brands whose page is still on an older version.

### Addition 6: what remains after a subscriber is deleted

- The subscriber row is deleted. Nothing in our tables then holds the email address:
  - the audit entry `subscriber_deleted` keeps the subscriber's id, brand, client, who deleted it, and when, with `before` and `after` empty;
  - no other table stores subscriber emails (no copies, no exports in this batch).
- **What we do not control**, stated in the report and the screen's help text: Supabase's own database backups keep the row until they expire under the project's plan. When an email platform is connected (batch 16), the deletion must also reach it; E-02 will cover that.
- The server never logs email addresses. Supabase's API logs record request paths and status, not request bodies (to be confirmed by the owner in the dashboard; it is not visible from here).

### Extra sabotage cases from the additions

| # | Change | Test that must fail |
|---|---|---|
| B22 | The one-verified-row-per-host index removed | DB "a host verified for one client cannot be verified by another" |
| B23 | The add-host trigger skips the other-client check | DB "cannot add a host another client has verified" |
| B24 | Public lookup falls back to the first brand, or matches by suffix | DB unknown host; e2e unknown and suffix hosts |
| B25 | Host constraint accepts an IP address | DB constraint test |
| B26 | `subscribe` works with the sign-up switch off | DB; e2e 9 |
| B27 | Checklist ignores `failed_since` | DB go-live after a failed re-check |
| B28 | `set_signup` skips the contact-email check | DB "no sign-up without a contact email" (owner's item 5) |
| B29 | The placeholder check on publishing standard pages removed | DB "a policy with {{email}} left in it cannot be published" (owner's item 5) |

Sabotage runs only for rules that protect access, money, compliance, or data isolation; pure display tests get none. Runs are in the foreground, one case at a time, with one Playwright worker, and servers and browsers stopped between cases.

---

## 12. Build notes, step 1 (17 October 2026)

- **Hosts are matched exactly.** 0003's `normalise_host` stripped `www.`, so `www.brand.com` served `brand.com`'s site. Since 0010 (`request_host`), a `www` host is a host of its own, added and verified like any other. This follows from addition 3: no fallback of any kind. `site_rules.sql` now proves an unlisted `www` host gets nothing.
- **The verification code** is `gen_random_uuid()` without its hyphens: 32 hex characters, 122 random bits. It needs no extension, which matters on Supabase, where `pgcrypto` lives in another schema.
- **The earlier suites' test hosts** (`brand-a.test` and others) became `brand-a-test.com` and similar, because 0010 refuses `.test` names as real hosts. Their sites are made live by `supabase/tests/local_sites.sql` (`test_make_live`), a test-only helper applied after the migrations and never on Supabase. `privacy_template_rules.sql` now expects 0012's email lines as well as 0007's lines.
- **`service_role` stand-in** in `local_bootstrap.sql` for the plain PostgreSQL tests; Supabase has the real role.
- **`npm run test:db`:** 12 of 12 (eleven suites plus the recovery-file test), every suite with 0009 to 0012 applied, each of 0010 to 0012 applied twice.
- **The three verify files** were run on a scratch PostgreSQL 16 after all migrations: every check row reads ok.
- **On the local Supabase stack**, 0010 to 0012 apply cleanly. Backfill: AffilyVault draft with `affilyvault.com` pending; Famperia's `famperia.com` pending with no site (it is a dropshipping brand); nothing live.
- **Not committed at the pause.** The end-to-end tests now fail by design: the application still reads sites through the public functions, which serve nothing until a site is live, and previews need the new preview functions. Both are steps 3 and 4. The batch is committed when `npm run test:all` is green.


---

## 13. The owner's review of 0010 to 0012, and the build (17 October 2026)

**Changes made in place (unapplied migrations):**

1. A live site's published standard pages cannot be unpublished or deleted (`page_site_live`). Delete was added to the same rule so that it cannot be used to get around it. The rule applies while the site is served (live, with the affiliate module on).
2. `privacy_page_current` also requires the published body to contain the sign-up paragraph.
3. `subscribe()` and `public_signup()` require a current policy. They moved from 0011 to 0012, which defines the check.
4. `subscribe(p_host, p_email, p_page, p_consented, p_consent_version, p_honeypot)`: a version other than the current one is refused (`signup_wording_changed`).
5. `record_domain_check` refuses when any other row for the host is verified, the same client's other brand included, and also maps a `unique_violation` to `domain_taken`.

Also: `site_already_live`; sign-up needs a contact email; no standard page published with a `{{placeholder}}`.

**Build notes:**

- **Server actions and hosts.** A server action's redirect is rendered inside the same request, without the middleware's routing by host. The sign-up form therefore returns its answer to the form (`useActionState`) instead of redirecting.
- **End-to-end tests on brand hosts.**
  - The test browser maps the test hosts to the local application (Chromium `--host-resolver-rules`).
  - Crafted Host headers (empty, look-alike) go straight to the server through `rawGet`.
  - Fake DNS answers are written to `e2e/.run/dns.json`, which the application reads only when it points at the local stack.
- **The `site.spec.ts` public-site test** now takes AffilyVault live on `affilyvault.com` first, because 0010 ended the public preview.
- **`npm run test:all`:** 216 unit tests, 12 database checks, 54 end-to-end tests.

---

## 14. Known limits (owner's SQL review, 17 October 2026)

(a) **Going live and an unpublish at the same moment.** `go_live` reads the launch checklist and then marks the site live. A person unpublishing a standard page in the same instant can commit between the two, so both succeed, and the site is live with one standard page unpublished. Once live, the page cannot be unpublished again (`page_site_live`). The gap is the moment itself. It is not closed in this batch: closing it would mean locking the brand's standard pages while `go_live` runs.

(b) **Unsubscribed, then signing up again.** `subscribe()` keeps the first record for a brand and email (`on conflict do nothing`). A person who unsubscribed (batch 16) and signs up again therefore stays unsubscribed, and no new consent record is written. Batch 16 decides how re-subscription works.

(c) **Update from template replaces the draft.** The screen now says so before it runs, in two places:
- the panel carries the sentence "Updating replaces this page's draft with the template's wording, filled with the brand's details. Changes made in the draft are lost. Visitors keep seeing the published page until you publish.";
- pressing the button asks "Replace this page's draft with the template's wording? Changes made in the draft are lost. The published page does not change until you publish." Cancelling sends nothing.

The end-to-end test checks the sentence and the question, and that cancelling leaves the draft unchanged.

