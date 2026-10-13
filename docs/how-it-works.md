# How it works

A plain-language overview for someone who needs to understand the product without reading the code.
Updated after increment 4, October 2026.

---

## What the platform does

It runs affiliate marketing for brands. Affiliate marketing means earning a commission by
sending visitors to a seller's product page and getting paid when they buy. The platform does
the work that would otherwise be done by hand: it scores offers, builds the website, records
every click, and pulls in sales data so you can see what is working.

---

## Clients and brands

The platform is multi-tenant. One installation serves several independent clients.

A **client** is the company or person who owns one or more brands. Everything a client owns
is kept separate from every other client. A client's users cannot see another client's data.

A **brand** is the affiliate website: it has its own domain name, its own niche (what it is about),
and its own set of offers. One brand might be a site about dog training software; another might
be about productivity tools. They are run independently.

The **owner** (Vividha Marketing, Amit Chakraborty) has access to every client and can switch
between them. Clients see only their own brands.

---

## Offers

An **offer** is a product that the brand promotes on commission. For example, if the brand is
in the dog-training niche, one offer might be a video course on training recall.

When an offer is added, the platform gives it a **score out of 100** and recommends whether
it is worth running with paid advertising, free content, or not at all. The score is based on
how much each click earns, how many visitors convert to buyers, what the payout is, how often
sales are refunded, and how restricted the seller's terms are.

Before any content can be published for an offer, a person must **approve** it. Approval
records that the offer has been reviewed and the seller's rules have been checked.

---

## The public website

Each brand has its own website, served on its own domain. The site is built inside the platform,
not on a separate service.

Every brand site has four **standard pages** that must be published before any offer content
can go live: an affiliate disclosure, a privacy policy, terms of use, and a contact page. These
are filled from templates and are required for compliance.

**Offer pages** describe a specific product. They are written as drafts, checked automatically
for compliance problems (such as unsupported claims or forbidden phrases), and then approved and
published by a person.

**Articles** are informational content that may mention several offers or none. They go through
the same draft, check, and publish flow.

A page can be updated as many times as needed in draft without visitors seeing anything new.
Once published, the published version stays visible even if the draft is changed again. A second
publish is needed for changes to go live.

---

## Tracked links and clicks

When a visitor clicks through to a seller's product page, they follow a **tracked link** rather
than going directly. The tracked link records the click and redirects the visitor.

Each tracked link is specific to one offer, one channel (for example, Pinterest), and optionally
a campaign name and creative variant. This means the platform can answer "how many clicks did
the Pinterest ad for this offer get last month?" separately from the YouTube campaign.

When the tracked link redirects the visitor, it appends a short tracking code (`tid=`) to the
destination URL. ClickBank reads this code when the visitor buys, so the sale can be matched back
to the exact link that sent the visitor.

---

## Sales and results

ClickBank (the affiliate network) records each sale, refund, and recurring charge. The platform
imports these records when the owner or an operator presses the import button on a brand's
Results page. Clients cannot run an import. For now the ClickBank key on the server belongs to
one client's account (Vividha Marketing), and imports are refused for any other client until
each client can connect their own account. Running an import twice never counts a sale twice.

During import, each sale's tracking code is matched against the tracked links in the database.
If a match is found, the sale is attributed to that link's offer, brand, and channel. If no
match is found — perhaps because the link was deleted, or the visitor came from outside the
platform — the sale is stored as **unmatched** at the client level.

The **results dashboard** for each brand shows, for any date range:

- How many clicks each offer received.
- How many sales converted (sales and recurring charges), and the conversion rate.
- Gross commission earned, commission refunded, and net commission.
- Earnings per click (net commission divided by clicks).

Unmatched commissions (those with no matching link) appear on the client page rather than under
any specific brand.

---

## Compliance

Compliance rules are enforced in several layers.

1. **Standard pages.** Every brand site must have an affiliate disclosure, privacy policy, terms
   of use, and contact page before any offer content can be published.

2. **Wording check.** When a page is published, its text is scanned for phrases that break the
   rules: unsupported superlatives ("best", "#1"), fake urgency ("only 3 left"), unsubstantiated
   health or income claims, and words that make the site appear to be the seller rather than an
   independent reviewer.

3. **Seller rules.** Each offer has a rules record that captures the seller's specific restrictions
   (for example, one seller forbids bidding on their brand name in paid search). These banned
   phrases are also checked at publish time.

4. **Offer approval.** A page for an offer cannot be published until the offer itself has been
   approved by a person, and the seller's rules record has been approved too.

These checks do not replace legal review. They are a first line of defence.

---

## What agents will eventually do

The platform is designed so that agents (automated programs) do the routine work while people
keep control of what matters.

In a future increment, agents will:

- Draft offer pages and articles from the seller's published facts.
- Write ad copy variants.
- Check that live links still work.
- Pull hourly performance data and pause campaigns that hit budget caps.

Agents always save their work as drafts and check `approval_settings` before publishing or
spending. A person still approves every piece of content and every live campaign unless the
approval mode has been explicitly set to allow unattended publishing for that action type.

---

## What the platform does not do

- It does not take payments. For the owner's own digital products, a hosted checkout from a
  payment provider will be used. No payment code is ever built here.
- It does not replace Shopify for dropshipping. That store exists separately and a read-only
  connection may be added later.
- It does not store any customer personal data from orders: no names, email addresses, or
  postal codes. Only the receipt number, date, transaction type, amounts, product title, and
  tracking code are kept.
