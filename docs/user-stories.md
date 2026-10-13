# Affiqube: User Stories

Story bank of 13 October 2026. One platform and one codebase: a shared core and two modules, affiliate marketing and dropshipping. Test brands: AffilyVault (affiliate marketing) and Famperia on famperia.com (dropshipping). The Excel workbook `Affiqube_Story_Bank_Final.xlsx` is the master; this file mirrors it for Claude Code.

Columns: Aff and Drop = applicable to each business; Workstream = Core, Affiliate, or Dropshipping; Release = planned release (see the end of this file). Status reflects the build as of increment 4.

## Epic 1: Tenancy and access

| ID | Story | Aff | Drop | Workstream | Priority | Status | Release | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T-01 | As the owner, I want to create a client with one or more brands, so that each client's work is kept separate. | Yes | Yes | Core | Must | Done | R0 | Every record carries a client ID and a brand ID. |
| T-02 | As the owner, I want role-based access, so that people see only what their role allows. | Yes | Yes | Core | Must | Done | R0 | A client login cannot read another client's rows, enforced by database policy and proven by a test. |
| T-03 | As a client admin, I want to invite my own users, so that my team can view our results. | Yes | Yes | Core | Should | Not started | R10 | Invited users receive a role limited to that client. |
| T-04 | As the owner, I want master access with a client switcher, so that I can work across all clients from one login. | Yes | Yes | Core | Must | Done | R0 | The owner can open any client's brands without a separate account. |
| T-05 | As the owner, I want two-factor sign-in for admin roles, so that a stolen password is not enough. | Yes | Yes | Core | Should | Not started | R10 | Owner and client admin logins require a second factor. |
| T-06 | As the owner, I want an audit log of every action that publishes or spends, so that I can trace what an agent or person did. | Yes | Yes | Core | Must | Done | R0 | Each entry records actor, time, action, and before and after values. |
| T-07 | As the owner, I want each brand's business type to switch its modules on, so that a brand sees only the features its business uses. | Yes | Yes | Core | Must | Partial: built in increment 5; the wizard re-run waits for W-02 | R1 | Business type is Affiliate marketing, Dropshipping, or Both; it enables the matching modules for that brand; screens, wizard steps, and agents of a disabled module are hidden and refused; changing the type is logged and re-runs the wizard for the new steps. |

## Epic 2: Configuration

| ID | Story | Aff | Drop | Workstream | Priority | Status | Release | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-01 | As the owner, I want a brand profile with name, domain, colours, logo, voice, and target country, so that agents produce consistent work. | Yes | Yes | Core | Must | Partial | R1 | Pages and ads for a brand use its profile values. |
| C-02 | As the owner, I want daily and monthly budget caps per brand and per campaign, so that spend never exceeds what I set. | Yes | Yes | Core | Must | Not started | R8 | An action that would exceed a cap is rejected and logged. |
| C-03 | As the owner, I want a rules record per offer, holding the seller's promotion rules, banned claims, and permitted images, so that agents stay within each seller's terms. | Yes | No | Affiliate | Must | Partial | R3 | Content generation fails if the offer has no approved rules record. |
| C-04 | As the owner, I want standard compliance templates for disclosure and policies, so that each new site starts compliant. | Yes | No | Affiliate | Must | Done | R0 | A new site receives the templates with the brand's particulars filled in. |
| C-05 | As the owner, I want connection settings per brand for affiliate networks, ad accounts, and analytics, so that agents can act on the right accounts. | Yes | Yes | Core | Must | Partial | R2 | Secrets are stored encrypted on the server and never sent to the browser. |
| C-06 | As the owner, I want an approval mode per action type, so that I choose what agents may do unattended. | Yes | Yes | Core | Must | Partial | R2 | Publishing a page, launching an ad, and raising a budget can each be set to automatic or approve-first. |
| C-07 | As the owner, I want guardrail thresholds per brand, so that agents know when to stop. | Yes | Yes | Core | Must | Not started | R8 | Maximum cost per click and minimum conversion rate are stored and used by Epic 7. |
| C-08 | As the owner, I want the offer scoring weights and thresholds held in configuration, so that I can tune how offers are ranked without a code change. | Yes | Yes | Core | Must | Partial | R2 | Weights must total 100. A change takes effect on the next scoring run and is written to the audit log. |

## Epic 3: Offers

| ID | Story | Aff | Drop | Workstream | Priority | Status | Release | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O-01 | As a client, I want to choose my niche from scored suggestions or enter my own, so that the work starts from my decision. | Yes | Yes | Core | Must | Partial | R2 | The choice is saved to the brand profile. An entered niche is assessed the same way as a suggested one. |
| O-07 | As a client, I want to choose my marketing platforms from a recommended list, so that effort goes where my audience is. | Yes | Yes | Core | Must | Partial | R2 | Each platform shows why it is or is not recommended for the niche. The choice is saved to the brand profile. |
| O-02 | As the owner, I want to record an offer with its payout, conversion rate, earnings per click, and gravity, so that decisions rest on data. | Yes | No | Affiliate | Must | Done | R0 | An offer can be entered by hand or imported, and each figure carries its date. |
| O-03 | As a client, I want each suggested offer given a weighted score with a plain-language explanation, so that I can compare offers without knowing the jargon. | Yes | No | Affiliate | Must | Done | R0 | The score uses the eight parameters and weights in the scoring model below. Each offer shows its score out of 100, its break-even cost per click, a recommended channel (paid, organic, or reject), and one or two sentences explaining the result. |
| O-08 | As a client, I want to submit my own product by pasting my affiliate link, so that it is scored and checked like a suggested one. | Yes | No | Affiliate | Must | Partial | R3 | The platform collects the five inputs listed below, shows what it found and what is missing, and asks the client for the rest. The score is marked provisional until the seller's terms are recorded. |
| O-04 | As the owner, I want an agent to read a seller's affiliate terms and draft the rules record, so that I do not transcribe them by hand. | Yes | No | Affiliate | Should | Not started | R3 | The draft lists each rule with its source sentence and waits for approval. |
| O-05 | As a client or the owner, I want to select and approve offers before any content is created, so that nothing is promoted without a decision. | Yes | No | Affiliate | Must | Done | R0 | Unapproved offers cannot be used by other epics. |
| O-06 | As the owner, I want a tracked affiliate link per channel and per variant, so that sales can be traced to their source. | Yes | No | Affiliate | Must | Done | R0 | Each link stores its channel, campaign, and creative labels. |

## Epic 4: Site module

| ID | Story | Aff | Drop | Workstream | Priority | Status | Release | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S-01 | As the owner, I want to create a site for a brand on its own domain from a template, so that a new brand is live quickly. | Yes | No | Affiliate | Must | Partial | R3 | One deployment serves several domains, each showing only its brand. |
| S-02 | As the owner, I want an agent to draft an overview page from the offer's facts and rules, so that pages are produced without my writing them. | Yes | No | Affiliate | Must | Not started | R3 | The draft cites the source of each fact and passes the rules check in K-05. |
| S-03 | As the owner, I want a draft, approve, publish flow with a preview, so that nothing goes public unseen unless I allow it. | Yes | No | Affiliate | Must | Done | R0 | A page has draft and published versions; publishing is logged. |
| S-04 | As the owner, I want the standard pages created with each site, so that disclosure, privacy, terms, and contact always exist. | Yes | No | Affiliate | Must | Done | R0 | A new site has all four before its first offer page can publish. |
| S-05 | As a visitor, I want the home page to list the brand's active offers, so that I can find them. | Yes | No | Affiliate | Must | Done | R0 | Adding or retiring an offer updates the home page without manual editing. |
| S-06 | As the owner, I want articles on each site, so that the brand can earn search and social traffic. | Yes | No | Affiliate | Must | Done | R0 | Articles support a title, body, image, tags, and a disclosure line. |
| S-07 | As the owner, I want outbound links routed through a tracked redirect, so that clicks are counted per offer and source. | Yes | No | Affiliate | Must | Done | R0 | Each click is recorded with brand, offer, page, and source before redirecting. |
| S-08 | As the owner, I want an email sign-up form with recorded consent, so that I can build a subscriber list lawfully. | Yes | No | Affiliate | Should | Not started | R7 | Each subscriber record stores the consent text and time. |
| S-09 | As the owner, I want a daily check for broken links, placeholders, and changed seller facts, so that pages stay accurate. | Yes | No | Affiliate | Should | Not started | R3 | Failures raise an alert naming the page and the problem. |
| S-10 | As the owner, I want version history with rollback, so that a bad change can be undone. | Yes | No | Affiliate | Should | Not started | R10 | Any earlier published version can be restored in one action. |
| S-11 | As the owner, I want a hosted checkout for my own digital products, so that I can sell without building payments. | Yes | No | Affiliate | Could | Not started | R11 | The site shows the product; a payment provider takes the payment and confirms it. |
| S-12 | As the owner, I want an existing affiliate site's pages and policies moved onto the platform, so that a Shopify-hosted brand can stop paying for Shopify. | Yes | No | Affiliate | Should | Not started | R3 | Pages import as drafts with their text, images, and links; affiliate links become tracked links; the domain is moved only after every page is published and checked. |

## Epic 5: Creative

| ID | Story | Aff | Drop | Workstream | Priority | Status | Release | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| K-01 | As the owner, I want an agent to write ad copy variants for an offer, so that I have options to test. | Yes | Yes | Core | Must | Not started | R8 | Each variant has primary text, headline, and description, and passes K-05. |
| K-02 | As the owner, I want static ad designs in the sizes each placement needs, built from the brand's design system, so that ads are on-brand. | Yes | Yes | Core | Must | Not started | R8 | Each design exists in square and vertical formats and can be exported as an image. |
| K-03 | As the owner, I want generated background or lifestyle images through a connected tool, so that ads are not limited to seller banners. | Yes | Yes | Core | Should | Not started | R10 | Generated images never depict the product falsely and are labelled in the library. |
| K-04 | As the owner, I want short video creatives made from a design, so that I can run Reels. | Yes | Yes | Core | Could | Not started | R11 | A design can be sent to a video tool and the result stored. |
| K-05 | As the owner, I want each creative and page checked against the offer's rules and the ad platform's policy, so that non-compliant content is stopped early. | Yes | Yes | Core | Must | Partial | R8 | The check returns pass, or fail with the rule that was broken; failed items cannot be approved. |
| K-06 | As the owner, I want a creative library showing each item's status and results, so that I can reuse what works. | Yes | Yes | Core | Should | Not started | R10 | Each creative links to its offer, its campaigns, and its performance. |
| K-07 | As the owner, I want each creative tagged with its angle and hook, so that test results show which ideas win, not just which ads. | Yes | Yes | Core | Should | Not started | R10 | Results can be grouped by angle and by hook; a test plan lists the angle and hook combinations to run and marks each with its result. |

## Epic 6: Campaigns

| ID | Story | Aff | Drop | Workstream | Priority | Status | Release | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M-01 | As the owner, I want to connect a brand's Meta ad account through partner access, so that the client keeps ownership of its assets. | Yes | Yes | Core | Must | Not started | R8 | The platform acts on a client's ad account without holding the client's login. |
| M-02 | As the owner, I want an agent to draft a campaign in a paused state, so that nothing spends before review. | Yes | Yes | Core | Must | Not started | R8 | The draft holds objective, audience, placements, budget, schedule, and creatives, with status paused. |
| M-03 | As the owner, I want approval to activate the campaign, so that launch is a deliberate step. | Yes | Yes | Core | Must | Not started | R8 | Activation checks the budget cap in C-02 and writes to the audit log. |
| M-04 | As the owner, I want A/B tests that change one element and use separate tracked links, so that results can be attributed. | Yes | Yes | Core | Must | Not started | R8 | The platform refuses a test whose variants differ in more than one element. |
| M-05 | As the owner, I want the conversion event verified before launch, so that the campaign optimises for the right action. | Yes | Yes | Core | Must | Not started | R8 | Launch is blocked if the pixel has not received the chosen event from the site. |
| M-06 | As the owner, I want TikTok and Pinterest campaigns, so that I can reach other audiences. | Yes | Yes | Core | Could | Not started | R11 | The same draft, approve, launch flow works for each added platform. |
| M-07 | As the owner, I want standard website audiences created for each brand from its pixel events, so that retargeting and lookalikes are ready before the first campaign. | Yes | Yes | Core | Should | Not started | R10 | For each brand, audiences exist for each tracked event across configured windows (default 1, 7, 15, 30, 60, 90, 120, 180 days), named consistently; lookalikes of 1 to 2 per cent can be created from any of them. |
| M-08 | As the owner, I want a campaign template held in configuration, so that every new campaign starts from a proven structure. | Yes | Yes | Core | Must | Not started | R8 | The template sets objective, budget type (campaign-level by default), number of ad sets (three to four, one creative angle each), country, age range, placements, naming as product and date, and destination as the product or offer page; a draft that departs from it is flagged. |
| M-09 | As the owner, I want a campaign protected from edits during its learning period and judged only after its evaluation window, so that early noise does not drive decisions. | Yes | Yes | Core | Must | Not started | R8 | Edits to a live campaign within the configured learning period require explicit override and are logged; win or lose verdicts are not issued before the evaluation window (default 7 days) unless a guardrail fires. |
| M-10 | As the owner, I want a product feed and shopping campaign on Google once a product is proven, so that I can scale beyond Meta. | No | Yes | Dropshipping | Could | Not started | R11 | The feed is created through the store's Google connection; a campaign can be drafted only for a product marked proven, and follows the same approval and budget rules. |

## Epic 7: Guardrails and monitoring

| ID | Story | Aff | Drop | Workstream | Priority | Status | Release | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G-01 | As the owner, I want performance pulled every hour, so that decisions use current figures. | Yes | Yes | Core | Must | Not started | R8 | Spend, clicks, conversions, and cost per result are stored per ad with a timestamp. |
| G-02 | As the owner, I want an ad set paused automatically when it reaches its cap or breaks a threshold, so that losses are limited. | Yes | Yes | Core | Must | Not started | R8 | The pause happens within one pull cycle and is logged with the reason. |
| G-03 | As the owner, I want alerts by email and phone for pauses, tracking failures, and sharp cost changes, so that I learn of problems quickly. | Yes | Yes | Core | Must | Not started | R8 | Each alert names the brand, the campaign, and the trigger. |
| G-04 | As the owner, I want budget increase recommendations with the supporting figures, so that scaling is evidence-based. | Yes | Yes | Core | Should | Not started | R10 | A recommendation takes effect only by approval or within a rule set in configuration. |
| G-05 | As the owner, I want weak ads paused by rule, so that budget moves to better ones. | Yes | Yes | Core | Should | Not started | R10 | The rule, such as no conversions after a set spend, is configurable per brand. |
| G-06 | As the owner, I want tracking health checked daily, so that a broken pixel or link is caught. | Yes | Yes | Core | Should | Not started | R10 | An alert is raised if an expected event count falls to zero. |
| G-07 | As the owner, I want a test verdict for each product or offer after its test budget is spent, so that losers are dropped quickly and their audiences reused. | Yes | Yes | Core | Must | Not started | R8 | When test spend or days reach the configured limit, the verdict is pass if CPA is at or below break-even, otherwise fail; a fail pauses its ads and records the reason; audiences built during the test are kept. |

## Epic 8: Organic content

| ID | Story | Aff | Drop | Workstream | Priority | Status | Release | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R-01 | As the owner, I want a content calendar per brand, so that publishing is regular. | Yes | Yes | Core | Should | Not started | R10 | Each planned item has a topic, a target offer, and a date. |
| R-02 | As the owner, I want an agent to draft articles that lead to an offer page, so that each brand builds search and social traffic. | Yes | No | Affiliate | Must | Not started | R3 | Each article is general, accurate guidance with a disclosure line, and passes K-05. |
| R-03 | As the owner, I want pin text and short video scripts produced from each article, so that one piece of work feeds several channels. | Yes | Yes | Core | Should | Not started | R10 | Each article yields at least three pin descriptions and one script. |
| R-04 | As the owner, I want posts scheduled to social platforms through connectors, so that publishing needs no manual step. | Yes | Yes | Core | Could | Not started | R11 | A post can be scheduled, and its status is shown. |
| R-05 | As the owner, I want short product videos posted to the brand's social channels from approved creatives, so that the brand gains free reach and trust. | Yes | Yes | Core | Could | Not started | R11 | An approved creative can be scheduled as a short video post; each post is logged with its channel and link. |

## Epic 9: Reporting

| ID | Story | Aff | Drop | Workstream | Priority | Status | Release | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P-01 | As the owner, I want sales and commission data imported from each affiliate network, so that revenue is known per offer. | Yes | No | Affiliate | Must | Partial | R3 | ClickBank sales are imported daily and matched to tracked links. |
| P-02 | As the owner, I want spend and revenue combined per brand and offer, so that I can see what is profitable. | Yes | Yes | Core | Must | Done | R0 | Return on ad spend, earnings per click, cost per click, and conversions are computed per offer and per channel. |
| P-03 | As any user, I want a dashboard filtered by brand and date and limited by my role, so that I see my own results. | Yes | Yes | Core | Must | Done | R0 | A client viewer sees only that client's brands. |
| P-04 | As the owner, I want a weekly written summary per brand, so that I can review without reading tables. | Yes | Yes | Core | Should | Not started | R10 | The summary states what changed, what was paused, and what is recommended. |
| P-05 | As a client admin, I want the summary emailed to me, so that I am kept informed. | Yes | Yes | Core | Should | Not started | R10 | The email goes only to that client's users. |
| P-06 | As the owner, I want to export data as CSV, so that I can analyse it elsewhere. | Yes | Yes | Core | Could | Not started | R11 | Any dashboard view can be exported. |
| P-07 | As the owner, I want results compared across clients, so that I can spot what works. | Yes | Yes | Core | Could | Not started | R11 | Comparisons are visible to the owner only. |
| P-08 | As the owner, I want a funnel report per product from impressions to purchase, so that I can see where buyers drop out. | Yes | Yes | Core | Must | Not started | R8 | The report shows impressions, clicks, CTR, CPC, CPM, page views, add to cart, checkout, purchase, CPA, ROAS, and AOV, with the largest drop between stages highlighted. |
| P-09 | As the owner, I want a visitor-behaviour tool such as session recording linked per brand, so that I can see why visitors do not buy. | Yes | Yes | Core | Could | Not started | R11 | The tool's project is recorded under the brand's connections and opened from its results page. |

## Epic 10: Shopify integration

| ID | Story | Aff | Drop | Workstream | Priority | Status | Release | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D-01 | As the owner, I want to connect a Shopify store to a brand, so that its orders and sales are available to the platform. | No | Yes | Dropshipping | Must | Not started | R4 | The connection uses a token limited to the scopes the platform needs. |
| D-02 | As the owner, I want Shopify revenue included in reporting, so that dropshipping and affiliate brands appear in one dashboard. | No | Yes | Dropshipping | Must | Not started | R4 | A Shopify brand shows revenue, spend, and return on ad spend like any other. |
| D-03 | As the owner, I want an agent to draft product listings in Shopify, so that catalogue work is reduced. | No | Yes | Dropshipping | Must | Not started | R4 | Listings are created as drafts and published only on approval. |

## Epic 11: Service operations

| ID | Story | Aff | Drop | Workstream | Priority | Status | Release | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| V-01 | As the owner, I want an onboarding checklist per client, so that accounts, access, and agreements are completed in order. | Yes | Yes | Core | Should | Not started | R10 | The checklist tracks the client's ad account, partner access, domain, and agreed budget. |
| V-02 | As the owner, I want an offboarding process, so that a departing client's access and data are handled cleanly. | Yes | Yes | Core | Should | Not started | R10 | Tokens are revoked, data is exported, and logins are deactivated, each logged. |
| V-03 | As the owner, I want client invoices generated from the agreed fee, so that billing needs no separate tool. | Yes | Yes | Core | Could | Not started | R11 | An invoice can be produced per client per period. |

## Epic 12: Suppliers and sourcing

| ID | Story | Aff | Drop | Workstream | Priority | Status | Release | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| U-01 | As the owner, I want to connect a brand to a supplier platform account, so that products and orders can flow without manual entry. | No | Yes | Dropshipping | Must | Not started | R5 | The connection is stored under C-05 with its secret kept server-side, and a test call succeeds. |
| U-02 | As the owner, I want candidate products imported with cost, shipping cost, delivery time, warehouse country, and stock, so that decisions rest on data. | No | Yes | Dropshipping | Must | Not started | R5 | Each figure is stored with its date and its supplier; a missing figure is shown as missing, not as zero. |
| U-03 | As a client, I want each candidate product scored out of 100 on ten weighted factors with a plain-language explanation, so that I can compare products without knowing the jargon. | No | Yes | Dropshipping | Must | Not started | R5 | Factors and default weights: demand 15, problem 10, trend 10, creative potential 10, economics 15, supplier 10, fulfilment 10, differentiation 5, offer 5, risk 10, held in configuration (C-08). Each product shows its score, break-even cost per order, and one or two sentences of explanation. |
| U-04 | As a client or the owner, I want to select and approve products before any listing or ad is created, so that nothing is sold without a decision. | No | Yes | Dropshipping | Must | Not started | R5 | An unapproved product cannot be listed, advertised, or ordered. Approval is written to the audit log. |
| U-05 | As the owner, I want a sample order and its result recorded against a product, so that quality and delivery time are checked before customers buy. | No | Yes | Dropshipping | Should | Not started | R10 | A product marked as requiring a sample cannot be approved until the sample result, with actual delivery days, is recorded. |
| U-06 | As the owner, I want a supplier terms record per product, holding processing time, return terms, warranty, and packaging, so that the store promises only what the supplier delivers. | No | Yes | Dropshipping | Must | Not started | R5 | Listing generation fails if the product has no approved supplier terms record. |
| U-07 | As the owner, I want a backup supplier recorded for each product, so that a stock-out does not stop sales. | No | Yes | Dropshipping | Should | Not started | R10 | A product can hold a second supplier with its own cost and delivery time, and an order can be switched to it. |
| U-08 | As a client, I want to submit my own product by pasting a supplier link, so that it is scored and checked like a suggested one. | No | Yes | Dropshipping | Should | Not started | R10 | The platform collects the figures it can, lists what is missing, and marks the score provisional until the supplier terms are recorded. |
| U-09 | As the owner, I want a research record for each candidate product holding its evidence, so that decisions rest on data rather than a hunch. | No | Yes | Dropshipping | Must | Not started | R5 | The record holds niche, customer, problem, where discovered, trend data, marketplace evidence (sales, 1 to 2-star review themes, items bought together), competitor ads and their running time, costs, retail prices, two to four creative angles, bundles, and risks; a product cannot be scored with any required field empty. |
| U-10 | As the owner, I want kill filters applied before scoring and minimum scores enforced after it, so that a high total cannot hide a fatal weakness. | No | Yes | Dropshipping | Must | Not started | R5 | A product failing any kill filter (brand or IP problem, regulated claim, no financial room, poor fulfilment, return-prone, collapsed trend) is rejected with the reason. After scoring, bands are 85+ primary, 75 to 84 backup, 65 to 74 watch, below 65 reject; a product below the minimum on demand, supplier, fulfilment, or risk cannot be primary. Thresholds are held in configuration. |
| U-11 | As the owner, I want competitor ads and stores recorded per product, with how long each ad has run and its price, so that I can see whether others are profiting. | No | Yes | Dropshipping | Should | Not started | R10 | Each competitor entry stores the ad or store link, first-seen date, days running, price, and offer; ads running longer than a configured number of days are flagged as a demand signal. |
| U-12 | As the owner, I want seasonal products tagged with their selling window and an alert before the window opens, so that ads start in time. | No | Yes | Dropshipping | Should | Not started | R10 | A product tagged as seasonal shows its window; an alert is raised a configured number of weeks before it opens, and its ads are paused when it closes. |

## Epic 13: Product compliance

| ID | Story | Aff | Drop | Workstream | Priority | Status | Release | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| H-01 | As the owner, I want a list of restricted product categories per destination country, so that prohibited goods are never listed. | No | Yes | Dropshipping | Must | Not started | R5 | A product in a restricted category for a brand's target country cannot be approved, and the refusal names the rule. |
| H-02 | As the owner, I want required safety documents recorded for regulated categories such as children's products, electrical goods, and cosmetics, so that the store can prove compliance. | No | Yes | Dropshipping | Must | Not started | R5 | A product in a regulated category cannot be approved until the required document is attached and its expiry date recorded. |
| H-03 | As the owner, I want each product checked for brand names, logos, and copied images, so that the store does not infringe another company's rights. | No | Yes | Dropshipping | Must | Not started | R5 | A product whose title, description, or images contain a listed brand term is held for review and cannot be published until cleared. |
| H-04 | As the owner, I want every product listing checked for unsupported claims, so that listings meet advertising rules. | No | Yes | Dropshipping | Must | Not started | R5 | The wording check from K-05 runs on each listing; a failed listing cannot be published and the failing phrase is shown. |
| H-05 | As the owner, I want store policy templates for refunds, shipping, privacy, and terms, filled with the brand's details and real delivery times, so that each new store starts compliant. | No | Yes | Dropshipping | Must | Not started | R5 | A new store brand receives all four policies; the shipping policy states delivery times no shorter than the supplier data supports. |
| H-06 | As the owner, I want reference prices, discounts, and timers checked for honesty, so that the store never shows a fake saving or false urgency. | No | Yes | Dropshipping | Must | Not started | R5 | A compare-at price must be a price at which the product was genuinely offered, recorded with its dates; countdown timers that reset are not allowed; a listing failing either cannot be published. |
| H-07 | As the owner, I want only genuine reviews from real customers shown, so that the store meets US rules on reviews. | No | Yes | Dropshipping | Must | Not started | R5 | Every displayed review is tied to a delivered order; reviews written by the store or its staff are refused; negative genuine reviews are not hidden. |

## Epic 14: Pricing and margin

| ID | Story | Aff | Drop | Workstream | Priority | Status | Release | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| N-01 | As the owner, I want the non-ad cost of each product calculated, including product cost, shipping, payment fees, and a refund reserve, so that the true margin is known before any ad runs. | No | Yes | Dropshipping | Must | Not started | R5 | Each product shows landed cost (product plus shipping) and non-ad cost (landed cost plus refund reserve plus payment fees), with the reserve percentage held in configuration. Changing any input updates both. |
| N-02 | As the owner, I want pricing rules held in configuration, with a minimum margin and a rounding rule, so that prices are set consistently. | No | Yes | Dropshipping | Must | Not started | R5 | A price below the minimum margin is rejected. A rule change is written to the audit log. |
| N-03 | As the owner, I want an alert when a supplier cost change pushes a product below the minimum margin, so that I do not sell at a loss. | No | Yes | Dropshipping | Must | Not started | R5 | Within one sync cycle the product is flagged, and it is unpublished automatically if the approval mode allows. |
| N-04 | As a client, I want each product to show its break-even cost per order, break-even ROAS, and contribution per sale, so that I know whether paid ads can work. | No | Yes | Dropshipping | Must | Not started | R5 | Break-even CPA = price minus non-ad cost; break-even ROAS = price divided by break-even CPA; contribution = price minus non-ad cost minus actual CPA. Each is shown beside the brand's expected cost, with a plain statement of which is higher. |
| N-05 | As the owner, I want a price per market and currency, so that one product can be sold in several countries. | No | Yes | Dropshipping | Could | Not started | R11 | A product holds a price for each market the brand sells in. |
| N-06 | As the owner, I want the working capital a brand needs forecast from its expected orders, so that I can fund suppliers before payouts arrive. | No | Yes | Dropshipping | Must | Not started | R5 | Forecast = orders per day times supplier cost per order times days until payout, plus ad budget, creative and app costs, and a refund reserve; the forecast updates when payout timing or volume changes, and an alert is raised when committed cash exceeds the funded amount. |
| N-07 | As the owner, I want offers configured per product, such as bundles, quantity discounts, free-shipping thresholds, and free gifts, so that order value rises without guesswork. | No | Yes | Dropshipping | Should | Not started | R10 | Each offer is checked against the minimum margin in N-02 before it can be published, and its effect on average order value is reported. |
| N-08 | As the owner, I want discount codes created and checked against margin, so that a promotion never sells at a loss. | No | Yes | Dropshipping | Must | Not started | R5 | A code that would take any product below the minimum margin is refused; each code records its limit per customer and its use count. |

## Epic 15: Listings and store

| ID | Story | Aff | Drop | Workstream | Priority | Status | Release | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| L-01 | As the owner, I want each listing written in the brand's own words from supplier facts, so that the store does not repeat a supplier's text or claims. | No | Yes | Dropshipping | Must | Not started | R6 | A drafted listing passes H-03 and H-04 and records the source of each stated fact. |
| L-02 | As the owner, I want stock and cost synced from the supplier at least daily, so that customers cannot buy what is unavailable. | No | Yes | Dropshipping | Must | Not started | R6 | An out-of-stock product is hidden within one sync cycle and shown again when stock returns. |
| L-03 | As a visitor, I want each product to show an honest delivery estimate, so that I know when to expect my order. | No | Yes | Dropshipping | Must | Not started | R6 | The estimate comes from the supplier's delivery data for the visitor's country and is never shorter than that data. |
| L-04 | As a visitor, I want collections and the home page to reflect the products on sale, so that I can find them. | No | Yes | Dropshipping | Should | Not started | R10 | Adding or retiring a product updates its collections without manual editing. |
| L-05 | As the owner, I want retiring a product to unpublish it and pause its ads together, so that nothing keeps spending on a product no longer sold. | No | Yes | Dropshipping | Should | Not started | R10 | One action unpublishes the listing and pauses every ad that points to it, each logged. |
| L-06 | As a visitor, I want related products and add-ons recommended on the product page, so that I can buy what goes with my purchase. | No | Yes | Dropshipping | Should | Not started | R10 | Each product can hold cross-sell and upsell items; recommendations shown are in stock and priced per N-02. |
| L-07 | As the owner, I want a launch-readiness check for each store, so that no ad sends traffic to an unfinished store. | No | Yes | Dropshipping | Must | Not started | R6 | The check covers domain connected, payment method active, storefront password removed, all policies published and linked, contact email shown, pixel firing, sign-up form live, and the four pre-launch emails tested (E-03). Campaigns for the brand cannot be activated until every item passes. |
| L-08 | As a visitor, I want each product page to answer common objections honestly, so that I can decide without contacting the store. | No | Yes | Dropshipping | Should | Not started | R10 | The page carries an FAQ drafted from the research record's negative-review themes, the delivery estimate from L-03, and a guarantee only where the supplier terms (U-06) support it. |

## Epic 16: Orders and fulfilment

| ID | Story | Aff | Drop | Workstream | Priority | Status | Release | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F-01 | As the owner, I want store orders imported from Shopify, so that every order can be tracked from payment to delivery. | No | Yes | Dropshipping | Must | Not started | R6 | Each order is stored with its products, amounts, and status, and re-importing does not create duplicates. |
| F-02 | As the owner, I want each paid order placed with the supplier automatically or on approval, so that fulfilment does not wait on me. | No | Yes | Dropshipping | Must | Not started | R6 | The order is placed according to the approval mode in C-06 and is refused if it would exceed the supplier-spend cap. |
| F-03 | As a customer, I want a tracking number as soon as my order ships, so that I can follow it. | No | Yes | Dropshipping | Must | Not started | R6 | The supplier's tracking number is written to the store order and the customer is notified by the store. |
| F-04 | As the owner, I want an alert when an order passes its promised delivery date, so that I can act before the customer complains. | No | Yes | Dropshipping | Must | Not started | R6 | An order past its promised date raises an alert naming the order, the supplier, and the days late. |
| F-05 | As the owner, I want orders the store marks as high risk held for review, so that fraudulent orders are not sent to the supplier. | No | Yes | Dropshipping | Should | Not started | R10 | A high-risk order is not placed with the supplier until a person releases it. |
| F-06 | As the owner, I want an alert when a supplier cannot fulfil a paid order, so that I can switch supplier or refund quickly. | No | Yes | Dropshipping | Should | Not started | R10 | The alert offers the backup supplier where one exists, or a refund. |
| F-07 | As the owner, I want only the customer data needed for fulfilment stored, and limited by role, so that personal data is protected. | No | Yes | Dropshipping | Must | Not started | R6 | Customer name and address are visible only to roles that fulfil orders, and a test proves one client cannot read another client's customers. |

## Epic 17: Customer service and returns

| ID | Story | Aff | Drop | Workstream | Priority | Status | Release | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Q-01 | As the owner, I want customer enquiries shown with the order's status and a drafted reply, so that answers are fast and accurate. | No | Yes | Dropshipping | Should | Not started | R10 | Each enquiry is linked to its order; a drafted reply is sent only as the approval mode allows. |
| Q-02 | As a customer, I want my return or refund request recorded and handled under the published policy, so that I am treated fairly. | No | Yes | Dropshipping | Must | Not started | R6 | Each request is stored against its order with a reason and an outcome consistent with the policy. |
| Q-03 | As the owner, I want refunds to follow an approval mode, so that money is returned deliberately. | No | Yes | Dropshipping | Must | Not started | R6 | A refund is issued in the store only on approval or within a limit set in configuration, and is written to the audit log. |
| Q-04 | As the owner, I want payment disputes recorded with the evidence needed to answer them, so that I can respond within the deadline. | No | Yes | Dropshipping | Should | Not started | R10 | Each dispute shows its deadline and collects the order, tracking, and delivery proof. |
| Q-05 | As the owner, I want refund and complaint rates tracked per product, with an automatic pause above a threshold, so that a bad product stops being sold. | No | Yes | Dropshipping | Must | Not started | R6 | A product above the threshold in C-07 has its ads paused within one cycle and is flagged for review. |
| Q-06 | As the owner, I want review requests sent after delivery and only real reviews shown, so that the store stays honest. | No | Yes | Dropshipping | Could | Not started | R11 | A review is shown only if it is tied to a delivered order. |

## Epic 18: Payments, tax, and profit

| ID | Story | Aff | Drop | Workstream | Priority | Status | Release | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| X-01 | As the owner, I want a payment provider connected per brand and its payouts recorded, so that money received is known. | No | Yes | Dropshipping | Must | Not started | R6 | Payouts are imported with their fees and matched to orders. |
| X-02 | As the owner, I want sales tracked by destination state or country against tax registration thresholds, so that I register and collect when required. | No | Yes | Dropshipping | Must | Not started | R6 | An alert is raised when sales into a state or country approach a threshold held in configuration. |
| X-03 | As a customer, I want to be told before I pay if my order may incur import duties, so that there are no surprise charges. | No | Yes | Dropshipping | Should | Not started | R10 | A product shipped across a border shows a duties notice at checkout where one applies. |
| X-04 | As the owner, I want profit shown per order and per product, after product cost, shipping, fees, ad spend, and refunds, so that I know what really earns money. | No | Yes | Dropshipping | Must | Not started | R6 | Profit per product matches a hand calculation from its orders, and a refunded order reduces it. |
| X-05 | As the owner, I want store payouts reconciled with supplier charges, so that missing or duplicated charges are found. | No | Yes | Dropshipping | Should | Not started | R10 | Each supplier charge is matched to one order; unmatched charges are listed. |
| X-06 | As the owner, I want an export for my accountant, so that tax filings need no manual collection. | No | Yes | Dropshipping | Could | Not started | R11 | Orders, refunds, fees, supplier costs, and tax collected can be exported per period. |
| X-07 | As the owner, I want every amount stored in its own currency and converted at a dated rate for reporting, so that profit is right when ads are paid in rupees and sales are in dollars. | Yes | Yes | Core | Must | Not started | R4 | Each amount keeps its original currency; reports convert at the rate for its date, show the rate used, and state the reporting currency set per brand. |

## Epic 19: Email marketing

| ID | Story | Aff | Drop | Workstream | Priority | Status | Release | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E-01 | As the owner, I want visitors invited to join the brand's email list with a clear incentive and recorded consent, so that a visitor who leaves can still be reached. | Yes | Yes | Core | Must | Not started | R7 | The sign-up form shows the incentive and the consent wording; each subscriber stores the consent text, time, and source page. Extends S-08 to store brands. |
| E-02 | As the owner, I want each brand connected to an email platform, so that flows and campaigns run from one place. | Yes | Yes | Core | Must | Not started | R7 | The connection is stored under C-05; subscribers and orders sync, and a test email arrives. |
| E-03 | As the owner, I want the four core automated emails built for each store before launch, so that visitors who leave are followed up from day one. | No | Yes | Dropshipping | Must | Not started | R7 | Welcome (within 5 minutes of sign-up), browse abandonment, abandoned cart, and order thank-you exist and have each been sent as a test; delays are held in configuration. L-07 checks this. |
| E-04 | As the owner, I want post-purchase emails for review requests, upsells, and win-backs, so that customers buy again without new ad spend. | No | Yes | Dropshipping | Should | Not started | R10 | Review request after confirmed delivery; upsell priced below the first order; win-back at configured intervals (default 90 and 180 days). Each email's discount passes N-08. |
| E-05 | As the owner, I want an agent to draft promotional emails for approval, so that the list is used regularly without my writing each one. | Yes | Yes | Core | Should | Not started | R10 | Drafts pass the wording check (K-05), include an unsubscribe link and the business address, and are sent only as the approval mode allows. |
| E-06 | As the owner, I want email results shown per flow and campaign, so that I know what email earns. | Yes | Yes | Core | Should | Not started | R10 | Opens, clicks, orders, and revenue per flow and per campaign appear on the brand's results page. |

## Epic 20: Brand setup wizard

| ID | Story | Aff | Drop | Workstream | Priority | Status | Release | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| W-01 | As a client, I want to start a brand by giving only its name, logo, and type of business, so that I can begin without knowing everything up front. | Yes | Yes | Core | Must | Not started | R1 | Name, logo, and business type are the only required inputs; the logo is checked for file type and size; the brand is created as a draft and the wizard opens at its first step. |
| W-02 | As a client, I want a guided wizard built from my business type, so that I complete the right steps in the right order. | Yes | Yes | Core | Must | Not started | R2 | Steps come from the core list plus the steps of each enabled module, in a defined order; each step has a completion check; a step whose prerequisite is incomplete cannot be opened. |
| W-03 | As a client, I want every answer saved as I go and the wizard to reopen where I left off, so that I can stop and return at any time, on any device. | Yes | Yes | Core | Must | Not started | R1 | Each field saves on change to the server; closing the browser loses nothing; reopening the brand returns to the last incomplete step; a test proves state survives a sign-out and a different device. |
| W-04 | As a client, I want to see which steps are done, which remain, and what still blocks launch, so that I know how far I have to go. | Yes | Yes | Core | Should | Not started | R2 | A progress view lists every step with its state; steps that block launch are marked; the count matches the launch-readiness check (L-07 for stores, S-04 for affiliate sites). |
| W-05 | As a client, I want to skip optional steps and come back to them later, so that I can launch with the essentials. | Yes | Yes | Core | Should | Not started | R2 | Optional steps can be skipped and reappear in the progress view; required steps cannot be skipped. |
| W-06 | As a client, I want the wizard to suggest answers from what it already knows, so that setup is quicker. | Yes | Yes | Core | Should | Not started | R10 | Suggestions include niche ideas, platforms, brand colours drawn from the logo, and policy text from the templates; each suggestion must be accepted or changed by the client before it is saved. |
| W-07 | As a client, I want to revisit any step after setup, so that I can change my brand as it grows. | Yes | Yes | Core | Should | Not started | R10 | Every step stays editable; a change that affects something live, such as a published policy or an active campaign, follows the approval mode (C-06) and is logged. |

## Release plan

| Release | Name | Workstream | Delivers | Stories |
| --- | --- | --- | --- | --- |
| R0 | Built in increments 1 to 4 | Mixed | Done; to be verified on both test brands. | T-01, T-02, T-04, T-06, C-04, O-02, O-03, O-05, O-06, S-03, S-04, S-05, S-06, S-07, P-02, P-03 |
| R1 | Increment 5: Module split and brand foundation | Core | Move affiliate code into its module; rename to Affiqube; replace the seeded brand with AffilyVault and Famperia; module entitlement; start-a-brand and save-and-resume. | T-07, C-01, W-01, W-03 |
| R2 | Increment 6: Setup wizard and configuration screens | Core | The wizard engine with core steps; niche and platform choice completed; scoring weights screen; connections with stored keys. | C-05, C-06, C-08, O-01, O-07, W-02, W-04, W-05 |
| R3 | Increment 7: Affiliate module complete for AffilyVault | Affiliate | Offer rules screen, drafting agent, articles, moving AffilyVault pages onto the platform, daily import. | C-03, O-08, O-04, S-01, S-02, S-09, S-12, R-02, P-01 |
| R4 | Increment 8: Deploy and connect Shopify | Core | Live deployment; Shopify connection, orders, and listings drafts; currency handling. | D-01, D-02, D-03, X-07 |
| R5 | Increment 9: Dropshipping sourcing and economics for Famperia | Dropshipping | Supplier connection, research record, scoring with kill filters, costs, pricing rules, product compliance. | U-01, U-02, U-03, U-04, U-06, U-09, U-10, H-01, H-02, H-03, H-04, H-05, H-06, H-07, N-01, N-02, N-03, N-04, N-06, N-08 |
| R6 | Increment 10: Store, orders, and launch gate for Famperia | Dropshipping | Listings in own words, stock sync, delivery estimates, launch readiness, order flow, refunds, payouts, profit. | L-01, L-02, L-03, L-07, F-01, F-02, F-03, F-04, F-07, Q-02, Q-03, Q-05, X-01, X-02, X-04 |
| R7 | Increment 11: Email marketing | Core | Sign-up with consent, email platform connection, pre-launch flows. | S-08, E-01, E-02, E-03 |
| R8 | Slice 2: Paid campaigns and guardrails | Core | Budget caps, creatives, Meta campaigns from the template, guardrails, test verdicts, funnel report. | C-02, C-07, K-01, K-02, K-05, M-01, M-02, M-03, M-04, M-05, M-08, M-09, G-01, G-02, G-03, G-07, P-08 |
| R9 | Remaining Must stories | Mixed | Scheduled after R8, in an order set when R8 closes. |  |
| R10 | Should stories | Mixed | Scheduled by value once the Must stories are built. | T-03, T-05, S-10, K-03, K-06, K-07, M-07, G-04, G-05, G-06, R-01, R-03, P-04, P-05, V-01, V-02, U-05, U-07, U-08, U-11, U-12, N-07, L-04, L-05, L-06, L-08, F-05, F-06, Q-01, Q-04, X-03, X-05, E-04, E-05, E-06, W-06, W-07 |
| R11 | Could stories | Mixed | Built only if a test brand needs them. | S-11, K-04, M-06, M-10, R-04, R-05, P-06, P-07, P-09, V-03, N-05, Q-06, X-06 |

## Brand setup wizard steps

| Order | Step | Shown for | Enters or confirms | Stories |
| --- | --- | --- | --- | --- |
| 1 | Brand basics | All | Brand name, logo, and type of business (affiliate marketing, dropshipping, or both) | W-01, T-07 |
| 2 | Business details | All | Operator name, address, contact email, target country, tagline | C-01 |
| 3 | Niche | All | Choose a suggested niche or enter your own; the platform scores it | O-01 |
| 4 | Marketing platforms | All | Choose platforms from the recommended list | O-07 |
| 5 | Budget and approvals | All | Daily and monthly caps; which actions need approval | C-02, C-06 |
| 6 | Domain | All | Connect the brand domain; the platform checks it | S-01, D-01 |
| 7 | Accounts to connect | All | Meta ad account, email platform, analytics | C-05, M-01, E-02 |
| 8 | Affiliate network | Affiliate marketing | Network account and key, such as ClickBank | C-05, P-01 |
| 9 | Offers and seller rules | Affiliate marketing | Choose and approve offers; record each seller's rules | O-02 to O-05, C-03 |
| 10 | Standard pages | Affiliate marketing | Review and publish disclosure, privacy, terms, contact | C-04, S-04 |
| 11 | Offer pages and links | Affiliate marketing | Approve drafted pages; tracked links are created | S-02, S-03, O-06 |
| 12 | Store connection | Dropshipping | Connect the Shopify store | D-01 |
| 13 | Supplier platform | Dropshipping | Connect the supplier account | U-01 |
| 14 | Product research and selection | Dropshipping | Review evidence and scores; approve a primary product and backups | U-02, U-03, U-04, U-09, U-10 |
| 15 | Pricing and offers | Dropshipping | Minimum margin, prices, discount codes, bundles | N-01 to N-08 |
| 16 | Store policies | Dropshipping | Review refund, shipping, privacy, terms | H-05 |
| 17 | Payments | Dropshipping | Connect the payment provider | X-01 |
| 18 | Email flows | Dropshipping | Review and test the four pre-launch emails | E-03 |
| 19 | Launch check | All | See what is missing; launch when every required item passes | W-04, L-07, S-04 |
