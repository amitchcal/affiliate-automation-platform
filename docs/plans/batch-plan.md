# Batch plan

Decided 17 October 2026. Work is delivered in batches. Each batch has its own plan, `docs/plans/batch-N-plan.md`, approved by the owner before any code is written. The rules are in CLAUDE.md under "Working in batches".

Batch 1 is increment 6, already in progress; its plan is `docs/plans/increment-6-plan.md`.

## Batches

| Batch | Name | Stories | Gate (starts after) |
| --- | --- | --- | --- |
| 1 | Invitations and two-factor | T-03, T-05 | In progress (increment 6) |
| 2 | Go-live gate | S-01, S-08 | Batch 1 |
| 3 | Wizard engine | W-01, W-02, W-03, W-04, W-05 | Batch 2 |
| 4 | Configuration screens | C-01, C-05, C-06, C-08, O-01, O-07 | Batch 3 |
| 5 | Affiliate module complete | C-03, O-04, O-08, S-02, S-09, S-12, R-02, P-01 | Batch 4 |
| 6 | Paid campaigns, setup | C-02, C-07, K-01, K-02, K-05 | Batch 4 |
| 7 | Paid campaigns, Meta | M-01, M-02, M-03, M-04, M-05, M-08, M-09 | Batch 6; needs Meta API access |
| 8 | Guardrails and reporting | G-01, G-02, G-03, G-07, P-08 | Batch 7 |
| 9 | Shopify connection | D-01, D-02, D-03, X-07 | Batch 2 |
| 10 | Sourcing | U-01, U-02, U-03, U-04, U-06, U-09, U-10 | Batch 9 |
| 11 | Product compliance | H-01, H-02, H-03, H-04, H-05, H-06, H-07 | Batch 10 |
| 12 | Pricing and margin | N-01, N-02, N-03, N-04, N-06, N-08 | Batch 10 |
| 13 | Store and listings | L-01, L-02, L-03, L-07 | Batches 11 and 12 |
| 14 | Orders | F-01, F-02, F-03, F-04, F-07 | Batch 13 |
| 15 | Refunds, payments, profit | Q-02, Q-03, Q-05, X-01, X-02, X-04 | Batch 14 |
| 16 | Email marketing | E-01, E-02, E-03 | Batch 15, or earlier if the owner asks |

**Not yet batched:** the Should and Could stories not listed above. They are ordered when batch 15 closes.

T-07 (business type switches modules) is built in increments 5 and 5.1 and is not in a batch. Its wizard re-run arrives with W-02 in batch 3.

## Migration numbers

Each batch plan reserves its migration numbers. A plan written while another batch is being built uses numbers after that batch's reservation, so the two never clash. Batch 1 uses 0008 and 0009.
