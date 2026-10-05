---
name: affiliate-compliance
description: Compliance rules for affiliate marketing content on this platform, drawn from ClickBank's promotional guidelines, US advertising rules, and each seller's own terms. Use this skill whenever you write, edit, review, or generate anything a member of the public will read for a brand - offer pages, articles, ad copy, text on ad images, pins, video scripts, emails, home page text - and whenever you add an offer, read a seller's affiliate terms, fill in a rules record, or change src/lib/compliance.ts or the compliance templates. Use it even when the request only says "write a page" or "draft an ad" and does not mention compliance.
---

# Affiliate compliance

## Why this exists

The owner's first rule for this business is that everything stays within ClickBank's policy and US law, with no exceptions, even when that costs conversions. A single non-compliant page or ad can lose an affiliate account or an ad account, and with it every brand that depends on them. When a persuasive line and a compliant line conflict, write the compliant one.

This is a working checklist, not legal advice. When something is unclear, stop and ask the owner; do not guess.

## The eight rules

| # | Rule | Write this | Not this |
|---|---|---|---|
| 1 | Disclose the affiliate relationship, on the page and near the links | A disclosure box at the top; "Affiliate link" beside each button | A disclosure only in the footer |
| 2 | No fake reviews or testimonials | "This page summarizes information published by the seller. We have not used the product ourselves." | "We tested it for a month", star ratings, quotes from customers we cannot verify |
| 3 | No unsubstantiated superlatives | "An online course taught through games" | "The best course", "#1", "top-rated" |
| 4 | No false scarcity or urgency | Nothing | "Only today", "limited time", countdown timers |
| 5 | No false or unprovable claims, especially health and results | "The publisher states a 60-day money-back guarantee" | "Guaranteed results", "cures", "works for every dog" |
| 6 | Do not appear to be the seller | "AffiQube is an independent affiliate; this is not the seller's official website." | A page or social account that looks official or is named after the product |
| 7 | Nothing aimed at children under 13 | Address parents and owners | Copy or targeting that speaks to children |
| 8 | No spam; never buy through the brand's own link | Email only people who signed up | Bought lists, unsolicited messages |

Two rules of thumb cover most cases:

- **Attribute.** A claim is the seller's, so say so: "the publisher states", "according to the seller". If you cannot point to where the seller says it, leave it out.
- **Describe, do not promise.** Say what the product contains and who it is designed for. Do not say what it will do for the reader.

Sellers' own sales pages often break rules 3 to 5. That is their choice on their site. Repeating their claims on ours makes us the publisher of them, so leave them out, and say plainly that results vary.

Do not state a price. Prices change and a stale one is a false statement. Link to the seller for the current price.

## Each seller has its own rules

Before any content is written for an offer, its rules record must exist and be approved. The database enforces this.

1. Find the seller's affiliate page and affiliate agreement. Read all of it.
2. Record each restriction in `offer_rules` with the sentence it comes from: banned claims, banned tactics, permitted images, anything unusual.
3. Set compliance risk (how regulated the claims are: health and income are high) and seller restrictions (how tightly promotion is limited).
4. If a clause can be read two ways, do not pick the convenient reading. Draft a short question for the owner to send to the seller, and keep the written reply. Mark the page as not cleared until then.

Restrictions already met on real offers, as examples of what to look for:

- No bidding on the seller's brand name in paid search.
- No Facebook page or account named after the product.
- No posting affiliate links on the seller's own social pages.
- No discounts, coupons, bonuses, or incentives to buy.
- An endorsement requires real use of the product, so write descriptions, not recommendations.
- No copying or republishing the seller's videos.

## Images

- Use only images the seller offers on its affiliate tools page, and only to promote that seller's product.
- Reject seller banners whose text makes a results or health claim, even though the seller supplied them.
- Do not show discs or printed books for a product that is a download.
- A generated image may set a scene. It must never depict the product, its packaging, or its results.

## Ads

Everything above applies, plus:

- No wording that implies knowledge of the reader's personal situation ("Is your child struggling to read?"). Use neutral phrasing ("Teaching a child to read at home?").
- State that the ad leads to an independent overview. Do not make the brand look like the seller.
- An A/B test changes one element only.
- Budgets are set by the owner in configuration. Never raise spend. Pausing is always allowed.

## Before publishing a page

1. The offer is approved and its rules record is approved.
2. Disclosure is at the top; each affiliate button is labelled.
3. The page says how it was prepared and that the product was not used, unless it really was.
4. Every factual claim is attributed and traceable to the seller's own material.
5. No price, no superlatives, no urgency, no testimonials, no guarantees of results.
6. The seller's banned claims do not appear.
7. A "who should look elsewhere" section exists and is honest.
8. The wording check in `src/lib/compliance.ts` passes.

## About the code check

`src/lib/compliance.ts` catches wording: superlatives, urgency, absolute and health claims, first-hand-use phrasing, and each offer's banned claims. It cannot tell whether a factual statement is true, and it does not read images. Passing it is necessary, not sufficient.

Extend the check when a new kind of problem appears. Never weaken or bypass it to get a page through. Standard pages (disclosure, privacy, terms, contact) are exempt because they are the compliance text itself.

## When in doubt

Stop, say what is uncertain and why, and ask the owner. A page that waits a day is cheap; a lost account is not.
