# Marketing Automation Platform: User Stories

Version of 5 October 2026. Build status for each story is tracked in `CLAUDE.md`, not here.

## Scope and prioritisation

This story bank covers a multi-tenant platform that runs affiliate and digital marketing for several brands and clients, with agents doing the work inside limits set in configuration. It holds 68 stories in 11 epics: 41 Must, 19 Should, and 8 Could.

The first client is one of the owner's own unused domains. A story is Must if that first client cannot be served end to end without it.

Core reporting is Must, not Should. The guardrails pause ads on cost and conversion figures, and the offer decisions rest on earnings per click, so without the data import and the combined metrics the agents have nothing to act on. Written summaries, client emails, and exports are the Should and Could items.

### Roles

| Role | Who | Scope |
| --- | --- | --- |
| Owner | Amit | All clients and brands; sets configuration and budgets |
| Operator | Amit's team, later | Assigned clients only |
| Client admin | The client's owner | Own brands; approvals where the agreement requires them |
| Client viewer | The client's staff | Own brands; read-only |
| Agent | The platform's AI workers | Acts only within configuration, offer rules, and approval settings |

### How to read a story

Each row gives an ID, the story, its priority, and the acceptance test that shows it is done. IDs are stable; reference them in build tasks and commits.

## Epic 1: Tenancy and access

Every client's data is separated at the database level, and the owner sees all of it. This epic must exist before any client data is stored.

| ID | Story | Priority | Acceptance |
| --- | --- | --- | --- |
| T-01 | As the owner, I want to create a client with one or more brands, so that each client's work is kept separate. | Must | Every record carries a client ID and a brand ID. |
| T-02 | As the owner, I want role-based access, so that people see only what their role allows. | Must | A client login cannot read another client's rows, enforced by database policy and proven by a test. |
| T-03 | As a client admin, I want to invite my own users, so that my team can view our results. | Should | Invited users receive a role limited to that client. |
| T-04 | As the owner, I want master access with a client switcher, so that I can work across all clients from one login. | Must | The owner can open any client's brands without a separate account. |
| T-05 | As the owner, I want two-factor sign-in for admin roles, so that a stolen password is not enough. | Should | Owner and client admin logins require a second factor. |
| T-06 | As the owner, I want an audit log of every action that publishes or spends, so that I can trace what an agent or person did. | Must | Each entry records actor, time, action, and before and after values. |

## Epic 2: Configuration

Configuration is where human decisions live. Agents read it and cannot change it.

| ID | Story | Priority | Acceptance |
| --- | --- | --- | --- |
| C-01 | As the owner, I want a brand profile with name, domain, colours, logo, voice, and target country, so that agents produce consistent work. | Must | Pages and ads for a brand use its profile values. |
| C-02 | As the owner, I want daily and monthly budget caps per brand and per campaign, so that spend never exceeds what I set. | Must | An action that would exceed a cap is rejected and logged. |
| C-03 | As the owner, I want a rules record per offer, holding the seller's promotion rules, banned claims, and permitted images, so that agents stay within each seller's terms. | Must | Content generation fails if the offer has no approved rules record. |
| C-04 | As the owner, I want standard compliance templates for disclosure and policies, so that each new site starts compliant. | Must | A new site receives the templates with the brand's particulars filled in. |
| C-05 | As the owner, I want connection settings per brand for affiliate networks, ad accounts, and analytics, so that agents can act on the right accounts. | Must | Secrets are stored encrypted on the server and never sent to the browser. |
| C-06 | As the owner, I want an approval mode per action type, so that I choose what agents may do unattended. | Must | Publishing a page, launching an ad, and raising a budget can each be set to automatic or approve-first. |
| C-07 | As the owner, I want guardrail thresholds per brand, so that agents know when to stop. | Must | Maximum cost per click and minimum conversion rate are stored and used by Epic 7. |
| C-08 | As the owner, I want the offer scoring weights and thresholds held in configuration, so that I can tune how offers are ranked without a code change. | Must | Weights must total 100. A change takes effect on the next scoring run and is written to the audit log. |

## Epic 3: Offers

An offer is a product promoted for a commission. The client chooses the niche, the platforms, and the offers; the platform supplies scored suggestions in plain language and accepts the client's own choices.

| ID | Story | Priority | Acceptance |
| --- | --- | --- | --- |
| O-01 | As a client, I want to choose my niche from scored suggestions or enter my own, so that the work starts from my decision. | Must | The choice is saved to the brand profile. An entered niche is assessed the same way as a suggested one. |
| O-07 | As a client, I want to choose my marketing platforms from a recommended list, so that effort goes where my audience is. | Must | Each platform shows why it is or is not recommended for the niche. The choice is saved to the brand profile. |
| O-02 | As the owner, I want to record an offer with its payout, conversion rate, earnings per click, and gravity, so that decisions rest on data. | Must | An offer can be entered by hand or imported, and each figure carries its date. |
| O-03 | As a client, I want each suggested offer given a weighted score with a plain-language explanation, so that I can compare offers without knowing the jargon. | Must | The score uses the eight parameters and weights in the scoring model below. Each offer shows its score out of 100, its break-even cost per click, a recommended channel (paid, organic, or reject), and one or two sentences explaining the result. |
| O-08 | As a client, I want to submit my own product by pasting my affiliate link, so that it is scored and checked like a suggested one. | Must | The platform collects the five inputs listed below, shows what it found and what is missing, and asks the client for the rest. The score is marked provisional until the seller's terms are recorded. |
| O-04 | As the owner, I want an agent to read a seller's affiliate terms and draft the rules record, so that I do not transcribe them by hand. | Should | The draft lists each rule with its source sentence and waits for approval. |
| O-05 | As a client or the owner, I want to select and approve offers before any content is created, so that nothing is promoted without a decision. | Must | Unapproved offers cannot be used by other epics. |
| O-06 | As the owner, I want a tracked affiliate link per channel and per variant, so that sales can be traced to their source. | Must | Each link stores its channel, campaign, and creative labels. |

### Scoring model

Each parameter is converted to a value from 0 to 100, multiplied by its weight, and summed. The weights are starting values, held in configuration under C-08.

| Parameter | What it tells the client | Source | Starting weight |
| --- | --- | --- | --- |
| Earnings per click | How much each visitor is worth | Marketplace | 25 |
| Payout per sale | How much one sale pays | Marketplace | 15 |
| Conversion rate | How many visitors buy | Marketplace | 15 |
| Compliance risk | How restricted the claims are, such as health or income | Rules record | 15 |
| Gravity | Proof that other affiliates are selling it | Marketplace | 10 |
| Seller restrictions | How tightly the seller limits promotion | Rules record | 10 |
| Recurring commission | Whether a sale keeps paying | Marketplace | 5 |
| Refund rate | How many sales are reversed | Marketplace or seller | 5 |

An offer with no measurable conversions is rejected whatever its score. An offer whose break-even cost per click is at or above the brand's expected cost per click is recommended for paid ads; otherwise it is recommended for organic traffic if its score clears the minimum.

### Inputs for a client-supplied product

| # | Input | Why it is needed | Supplied by |
| --- | --- | --- | --- |
| 1 | The client's own affiliate link | Proves approval to promote, and is the link every page and ad uses | Client |
| 2 | The seller's sales page | Source of the facts for the overview page | Derived from the affiliate link |
| 3 | Payout, conversion rate, earnings per click, gravity | Inputs to the score | The network's API where available; otherwise the client |
| 4 | The seller's affiliate terms | Become the offer's rules record | Found from the listing or sales page; otherwise the client |
| 5 | Permitted images | For pages and ads | The seller's affiliate tools page |

## Epic 4: Site module

This replaces Shopify for content and affiliate brands. Agents draft and update pages directly; publishing follows the approval mode in C-06.

| ID | Story | Priority | Acceptance |
| --- | --- | --- | --- |
| S-01 | As the owner, I want to create a site for a brand on its own domain from a template, so that a new brand is live quickly. | Must | One deployment serves several domains, each showing only its brand. |
| S-02 | As the owner, I want an agent to draft an overview page from the offer's facts and rules, so that pages are produced without my writing them. | Must | The draft cites the source of each fact and passes the rules check in K-05. |
| S-03 | As the owner, I want a draft, approve, publish flow with a preview, so that nothing goes public unseen unless I allow it. | Must | A page has draft and published versions; publishing is logged. |
| S-04 | As the owner, I want the standard pages created with each site, so that disclosure, privacy, terms, and contact always exist. | Must | A new site has all four before its first offer page can publish. |
| S-05 | As a visitor, I want the home page to list the brand's active offers, so that I can find them. | Must | Adding or retiring an offer updates the home page without manual editing. |
| S-06 | As the owner, I want articles on each site, so that the brand can earn search and social traffic. | Must | Articles support a title, body, image, tags, and a disclosure line. |
| S-07 | As the owner, I want outbound links routed through a tracked redirect, so that clicks are counted per offer and source. | Must | Each click is recorded with brand, offer, page, and source before redirecting. |
| S-08 | As the owner, I want an email sign-up form with recorded consent, so that I can build a subscriber list lawfully. | Should | Each subscriber record stores the consent text and time. |
| S-09 | As the owner, I want a daily check for broken links, placeholders, and changed seller facts, so that pages stay accurate. | Should | Failures raise an alert naming the page and the problem. |
| S-10 | As the owner, I want version history with rollback, so that a bad change can be undone. | Should | Any earlier published version can be restored in one action. |
| S-11 | As the owner, I want a hosted checkout for my own digital products, so that I can sell without building payments. | Could | The site shows the product; a payment provider takes the payment and confirms it. |

## Epic 5: Creative

Every creative is checked against the offer's rules before a person or a campaign can use it.

| ID | Story | Priority | Acceptance |
| --- | --- | --- | --- |
| K-01 | As the owner, I want an agent to write ad copy variants for an offer, so that I have options to test. | Must | Each variant has primary text, headline, and description, and passes K-05. |
| K-02 | As the owner, I want static ad designs in the sizes each placement needs, built from the brand's design system, so that ads are on-brand. | Must | Each design exists in square and vertical formats and can be exported as an image. |
| K-03 | As the owner, I want generated background or lifestyle images through a connected tool, so that ads are not limited to seller banners. | Should | Generated images never depict the product falsely and are labelled in the library. |
| K-04 | As the owner, I want short video creatives made from a design, so that I can run Reels. | Could | A design can be sent to a video tool and the result stored. |
| K-05 | As the owner, I want each creative and page checked against the offer's rules and the ad platform's policy, so that non-compliant content is stopped early. | Must | The check returns pass, or fail with the rule that was broken; failed items cannot be approved. |
| K-06 | As the owner, I want a creative library showing each item's status and results, so that I can reuse what works. | Should | Each creative links to its offer, its campaigns, and its performance. |

## Epic 6: Campaigns

Meta and Instagram come first. Campaigns are created paused and go live only as the approval mode allows.

| ID | Story | Priority | Acceptance |
| --- | --- | --- | --- |
| M-01 | As the owner, I want to connect a brand's Meta ad account through partner access, so that the client keeps ownership of its assets. | Must | The platform acts on a client's ad account without holding the client's login. |
| M-02 | As the owner, I want an agent to draft a campaign in a paused state, so that nothing spends before review. | Must | The draft holds objective, audience, placements, budget, schedule, and creatives, with status paused. |
| M-03 | As the owner, I want approval to activate the campaign, so that launch is a deliberate step. | Must | Activation checks the budget cap in C-02 and writes to the audit log. |
| M-04 | As the owner, I want A/B tests that change one element and use separate tracked links, so that results can be attributed. | Must | The platform refuses a test whose variants differ in more than one element. |
| M-05 | As the owner, I want the conversion event verified before launch, so that the campaign optimises for the right action. | Must | Launch is blocked if the pixel has not received the chosen event from the site. |
| M-06 | As the owner, I want TikTok and Pinterest campaigns, so that I can reach other audiences. | Could | The same draft, approve, launch flow works for each added platform. |

## Epic 7: Guardrails and monitoring

Actions that reduce spend run unattended. Actions that raise it follow the approval mode.

| ID | Story | Priority | Acceptance |
| --- | --- | --- | --- |
| G-01 | As the owner, I want performance pulled every hour, so that decisions use current figures. | Must | Spend, clicks, conversions, and cost per result are stored per ad with a timestamp. |
| G-02 | As the owner, I want an ad set paused automatically when it reaches its cap or breaks a threshold, so that losses are limited. | Must | The pause happens within one pull cycle and is logged with the reason. |
| G-03 | As the owner, I want alerts by email and phone for pauses, tracking failures, and sharp cost changes, so that I learn of problems quickly. | Must | Each alert names the brand, the campaign, and the trigger. |
| G-04 | As the owner, I want budget increase recommendations with the supporting figures, so that scaling is evidence-based. | Should | A recommendation takes effect only by approval or within a rule set in configuration. |
| G-05 | As the owner, I want weak ads paused by rule, so that budget moves to better ones. | Should | The rule, such as no conversions after a set spend, is configurable per brand. |
| G-06 | As the owner, I want tracking health checked daily, so that a broken pixel or link is caught. | Should | An alert is raised if an expected event count falls to zero. |

## Epic 8: Organic content

Free traffic is the main channel for low-payout offers, so article drafting is Must.

| ID | Story | Priority | Acceptance |
| --- | --- | --- | --- |
| R-01 | As the owner, I want a content calendar per brand, so that publishing is regular. | Should | Each planned item has a topic, a target offer, and a date. |
| R-02 | As the owner, I want an agent to draft articles that lead to an offer page, so that each brand builds search and social traffic. | Must | Each article is general, accurate guidance with a disclosure line, and passes K-05. |
| R-03 | As the owner, I want pin text and short video scripts produced from each article, so that one piece of work feeds several channels. | Should | Each article yields at least three pin descriptions and one script. |
| R-04 | As the owner, I want posts scheduled to social platforms through connectors, so that publishing needs no manual step. | Could | A post can be scheduled, and its status is shown. |

## Epic 9: Reporting

The data import and combined metrics are Must because Epics 3 and 7 depend on them. Summaries and exports are not.

| ID | Story | Priority | Acceptance |
| --- | --- | --- | --- |
| P-01 | As the owner, I want sales and commission data imported from each affiliate network, so that revenue is known per offer. | Must | ClickBank sales are imported daily and matched to tracked links. |
| P-02 | As the owner, I want spend and revenue combined per brand and offer, so that I can see what is profitable. | Must | Return on ad spend, earnings per click, cost per click, and conversions are computed per offer and per channel. |
| P-03 | As any user, I want a dashboard filtered by brand and date and limited by my role, so that I see my own results. | Must | A client viewer sees only that client's brands. |
| P-04 | As the owner, I want a weekly written summary per brand, so that I can review without reading tables. | Should | The summary states what changed, what was paused, and what is recommended. |
| P-05 | As a client admin, I want the summary emailed to me, so that I am kept informed. | Should | The email goes only to that client's users. |
| P-06 | As the owner, I want to export data as CSV, so that I can analyse it elsewhere. | Could | Any dashboard view can be exported. |
| P-07 | As the owner, I want results compared across clients, so that I can spot what works. | Could | Comparisons are visible to the owner only. |

## Epic 10: Shopify integration

Shopify stays for dropshipping. The platform reads from it; it does not replace it. None of these stories is needed for the first client, which is an affiliate brand.

| ID | Story | Priority | Acceptance |
| --- | --- | --- | --- |
| D-01 | As the owner, I want to connect a Shopify store to a brand, so that its orders and sales are available to the platform. | Should | The connection uses a token limited to the scopes the platform needs. |
| D-02 | As the owner, I want Shopify revenue included in reporting, so that dropshipping and affiliate brands appear in one dashboard. | Should | A Shopify brand shows revenue, spend, and return on ad spend like any other. |
| D-03 | As the owner, I want an agent to draft product listings in Shopify, so that catalogue work is reduced. | Could | Listings are created as drafts and published only on approval. |

## Epic 11: Service operations

These stories turn the platform into a service for other clients. They are needed before the second client, not the first.

| ID | Story | Priority | Acceptance |
| --- | --- | --- | --- |
| V-01 | As the owner, I want an onboarding checklist per client, so that accounts, access, and agreements are completed in order. | Should | The checklist tracks the client's ad account, partner access, domain, and agreed budget. |
| V-02 | As the owner, I want an offboarding process, so that a departing client's access and data are handled cleanly. | Should | Tokens are revoked, data is exported, and logins are deactivated, each logged. |
| V-03 | As the owner, I want client invoices generated from the agreed fee, so that billing needs no separate tool. | Could | An invoice can be produced per client per period. |

## Release slices

The 41 Must stories split into two releases, so that something usable exists before the paid-ads work begins. Each slice is complete on its own.

| Slice | Outcome | Stories | Count |
| --- | --- | --- | --- |
| 1. Site and measurement | A client chooses a niche, platforms, and offers; the brand is live on its own domain with compliant offer pages, articles, tracked links, and a dashboard showing clicks and commissions. Organic marketing can run. | T-01, T-02, T-04, T-06; C-01, C-03, C-04, C-05, C-06, C-08; O-01, O-02, O-03, O-05, O-06, O-07, O-08; S-01 to S-07; R-02; K-05; P-01, P-02, P-03 | 29 |
| 2. Paid campaigns | Agents draft ads and campaigns, launch on approval within budget caps, and pause on guardrails. | C-02, C-07; K-01, K-02; M-01 to M-05; G-01, G-02, G-03 | 12 |
| 3. Service readiness | Other clients can be onboarded, kept informed, and offboarded. | The Should stories, led by T-03, T-05, V-01, V-02, P-04, P-05 | 19 |

Slice 1 carries no spend risk, which makes it the right place to prove the agent workflow. Slice 2 depends on Meta API access, so that application should start while Slice 1 is being built.

## Open questions

1. **Where is it hosted for live?** Vercel is used for development. Hostinger is intended for live, which requires a plan that runs Node.js.
2. **How do agents run?** The assumption is scheduled jobs calling the Claude API, with each agent limited to the tools its task needs.
3. **Does AffilyVault move onto the platform?** If so, after Slice 1 is proven, since it is live on Shopify today.
4. **Which affiliate networks beyond ClickBank?** P-01 is written for ClickBank first; each added network needs its own import.
