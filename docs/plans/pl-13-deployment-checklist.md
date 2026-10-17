# PL-13: deployment checklist (Vercel, from `main`)

Prepared 17 October 2026. A checklist for the owner. Nothing here has been done; no hosted service was changed while writing it. PL-13 is the owner's item (deployment at a stable address), tracked outside the story bank.

## 0. Before you start

- **`main` is at increment 5.1 plus 0007** (`76693c0`). The two-factor and invitation screens are on `increment-6`; batch 2 is on `batch-2` (not finished).
  - Merge `increment-6` into `main` through a pull request on the private repository, after `npm run test:all` passes on it.
  - Merge `batch-2` only when batch 2 is finished and its report is approved.
- **Vercel plan.**
  - The Hobby plan is for **personal, non-commercial use only**. Affiqube serves clients for money, so it needs **Pro**.
  - Pro adds: commercial use; team members; higher usage limits (bandwidth, function run time, builds) with spend controls; and support.
  - Check Vercel's pricing page for the current figures before choosing, because they change.
- **Secrets stay out of chat and the repository.** You paste every value below into Vercel or Supabase yourself.

## 1. Deploy from `main` on Vercel

1. In Vercel: **Add New… → Project**, import the private repository, and choose **`main`** as the production branch.
2. **Framework preset:** Next.js. **Root directory:** the repository root. **Build command:** `npm run build`. **Install command:** `npm install`. **Output:** the default.
3. **Node.js version** (Project Settings → General): 20.x or later, matching your machine.
4. Set the environment variables in section 2 **before** the first build. A build without them fails, or builds an application that points nowhere.
5. Deploy. The project gets a production address such as `affiqube.vercel.app`; `*.vercel.app` is always treated as an admin host (see `src/middleware.ts`).
6. **Domains** (Project Settings → Domains): add `affiqube.com` (and `www.affiqube.com` if wanted), then set the DNS records Vercel shows at your registrar. Brand domains are **not** added in this step; batch 2 adds them one by one, once a site is ready.

## 2. Environment variables (names only)

| Name | Where | Value from | Needed from |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview | Supabase → Project Settings → API | now |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview | Supabase → API (anon public key) | now |
| `SUPABASE_SERVICE_ROLE_KEY` | **Production only**, never with a `NEXT_PUBLIC_` prefix | Supabase → API (service role) | increment 6 (invitation emails); batch 2 (domain checks) |
| `ADMIN_HOSTS` | Production | Optional extra admin hosts, comma separated; `affiqube.com` and `*.vercel.app` are built in | optional |
| `CLICKBANK_API_KEY` | Production only | ClickBank | when importing sales (increment 4) |
| `SITE_DNS_CNAME_TARGETS` | Production | The CNAME target Vercel shows for a custom domain | batch 2 |
| `SITE_DNS_A_TARGETS` | Production | The A record address Vercel shows for an apex domain | batch 2 |

- Preview deployments get **no** service role key. Invitations then cannot be sent from previews, which is intended.
- `NEXT_DIST_DIR` is used only by the test build. Do not set it on Vercel.

## 3. Supabase settings (dashboard, Authentication)

**URL configuration**
- **Site URL:** `https://affiqube.com`. Until the domain works, use the production `*.vercel.app` address and change it afterwards.
- **Redirect URLs:**
  - `https://affiqube.com/auth/confirm`
  - `https://affiqube.com/**`
  - the production `https://<project>.vercel.app/auth/confirm`
  - Do not add preview URLs with wildcards across all of `vercel.app`.

**Sign-in settings (Q9)**
- **"Allow new users to sign up": off.** The **Email provider stays on**; switching it off also stops password sign-in.
- Email confirmation: **on**.
- Multi-factor authentication, TOTP: **on**.
- Minimum password length: **12**.
- Email OTP (link) expiry: note the value and tell me.

**Email** (when Resend is opened, Q3)
- SMTP settings come from Resend.
- Sender: `Affiqube <no-reply@affiqube.com>`.
- DNS: SPF, DKIM and DMARC records on `affiqube.com`.

**Templates**
- Paste `supabase/email-templates/invite.html` into **Invite user**, and `magic-link.html` into **Magic link**.

## 4. Order against the migrations

Each step waits for the one before it.

| # | Step | Check |
| --- | --- | --- |
| 1 | Merge `increment-6` into `main`; deploy (section 1) with the variables (section 2) and settings (section 3) | Smoke test A |
| 2 | Run `0008_invitations.sql` in the SQL editor | `verify_invitations.sql`: every row ok |
| 3 | In the application: turn on two-factor sign-in for the owner, on **two** devices | — |
| 4 | Run the whole of `verify_two_factor.sql` | Only "the owner has a verified authenticator" must read ok. If "operators and client admins without an authenticator" is not "none", tell those people first |
| 5 | Run `0009_two_factor.sql` (it stops, changing nothing, if the owner has no authenticator) | `verify_two_factor.sql` again: every row ok; Smoke test B |
| 6 | Later, when batch 2 is finished and approved: merge `batch-2` into `main` | — |
| 7 | Run `0010_sites_and_domains.sql`, `0011_subscribers_and_consent.sql`, `0012_privacy_template_signup.sql`, **in that order**, then let the `batch-2` deployment go out | `verify_sites.sql`, `verify_subscribers.sql`, `verify_privacy_signup.sql`: every row ok; Smoke test C |

After 0010, no brand site is public until its domain is checked and it goes live. The platform serves nothing publicly today, so nothing is lost.

## 5. Smoke tests after each deploy

**A. After step 1 (application deployed; 0008 not yet run)**
1. `https://affiqube.com/login` (or the `vercel.app` address) loads over HTTPS.
2. The owner signs in with the password and reaches the clients list.
3. Open Vividha Marketing → AffilyVault: the Overview and the affiliate tabs load; Famperia shows the Overview only.
4. "Two-factor sign-in" is linked at the top of the page and the security screen opens.
5. Sign out, then go to `/clients`: you are sent to sign-in.
6. Browser developer tools → Sources: search the loaded scripts for the start of the service role key; it must not be found.

**B. After step 5 (0009 applied)**
1. Sign out, sign in with the password: the code step appears; a wrong code is refused; the right code opens the clients list.
2. A second browser, signed in before step 5 with the password only, now sees no data and is sent to the code step.
3. People screen of Vividha Marketing: invite a test address you own as a Viewer. If SMTP is not set up yet, expect "the email could not be sent", and withdraw it.
4. `verify_two_factor.sql`: every row ok.

**C. After step 7 (batch 2)**
1. `verify_sites.sql`: "sites live now" reads 0, and AffilyVault's host is waiting for a check.
2. Opening any brand domain that points at Vercel shows "This site is not available."
3. `/site/affilyvault.com` while signed out: not available. Signed in as the owner: the preview.
4. Email sign-up is off on every site.

## 6. If something goes wrong

- **The build fails:** read the Vercel build log. A missing variable is the usual cause (section 2).
- **Locked out after 0009:** use your second authenticator. If you have none, use `supabase/recovery/remove_two_factor.sql` with your address and a reason, sign in, and set two-factor up again on two devices. Then change your password.
- **Redirect errors on email links:** the Site URL or redirect URLs in section 3 do not match the address in the link.
