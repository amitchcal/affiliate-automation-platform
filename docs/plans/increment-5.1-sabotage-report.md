# Increment 5.1 sabotage report

Run on 17 October 2026, on the development machine (Windows, Docker Desktop), against commit `2f9fbbb`.

Each run made one temporary change that breaks the rule a test protects, ran only that test file, and reverted the change with `git restore` before the next run. Database changes were made by editing a migration file for the run only; the local test database is rebuilt from the migrations on every run, and the hosted project was never touched. At the end, `git status` showed no changes and `npm run test:all` passed.

"Red" means the test failed, and for the reason the change was meant to cause, as shown by the failure message.

| # | Test file | Change made | Result | What was fixed |
| --- | --- | --- | --- | --- |
| 1 | `famperia-refusals.spec.ts`: the database refuses a Famperia offer | Removed the trigger that refuses affiliate offers on a dropshipping brand (0005) | Red: the owner created the offer | Nothing needed |
| 2 | `scripts/test-db.sh` failure path | Same change as run 1 | Red: `module_rules.sql` reported ERROR and FAILED; the runner exited 1 | Nothing needed |
| 3 | `famperia-refusals.spec.ts`: no public site | `public_brand` no longer checks the affiliate module | Red: 200 instead of 404 | Nothing needed |
| 4 | `business-type.spec.ts`: two audit entries | Audit trigger watches `niche` instead of `business_type` | Red: no audit entries | Nothing needed |
| 5 | `roles.spec.ts`: viewer's save refused; admin cannot change the business type | Any member of the client may write to brands (policy in 0001) | Red: both tests; no refusal shown | Nothing needed |
| 6 | `roles.spec.ts`: clients kept apart (2 tests) | Any signed-in user may read every client and brand | Red: both tests; the other client was visible | Nothing needed |
| 7 | `site.spec.ts`: offer page cannot publish before the standard pages | Database rule allows up to 99 missing standard pages | Red: the offer page published | Nothing needed |
| 8 | `site.spec.ts`: a saved draft does not change what visitors see | `public_page` returns the draft summary | Red: the visitor saw the draft | Nothing needed |
| 9 | `site.spec.ts`: a tracked click is recorded | `record_click` does not insert the click | Red: count 0, expected 1 | Nothing needed |
| 10 | `site.spec.ts`: the redirect carries `tid` | Redirect leaves out `tid` | Red: address had no `tid` | Nothing needed |
| 11 | `site.spec.ts`: a duplicate link is refused | Removed `unique (brand_id, slug)` on tracked links (0001) | Red: the duplicate was accepted | Nothing needed |
| 12 | `scripts/e2e-guard.test.ts` | The guard accepts any address with port 54321 | Red: 3 of 10 tests failed | Nothing needed |
| 13 | Build scan for the hosted address (`scripts/e2e.mjs`) | Hosted project's address added to the root layout | Red: run stopped with "the test build names the hosted project"; no test ran | Nothing needed |
| 14 | `overview.spec.ts`: the three saves | The choices save drops the platforms | Red: Pinterest unchecked after the save | Nothing needed |
| 15 | `overview.spec.ts`: the form redraws after a save | Removed the choices form's `key` (the increment 5 fix) | Green | Not fixed; see "Known limits" |
| 16 | `tabs.spec.ts`: AffilyVault's four tabs | Dropped the Results tab | Red: 3 tabs | Nothing needed |
| 17 | `tabs.spec.ts`: Famperia shows the Overview only | Dropshipping switches on the affiliate module | Red: 4 tabs | Nothing needed |
| 18 | `famperia-refusals.spec.ts`: four screens refused | The affiliate screen guard always allows | Red: all 4 screens opened | Nothing needed |
| 19 | `business-type.spec.ts`: Both shows the tabs | "Both" switches on dropshipping only | Red: no affiliate tabs | Nothing needed |
| 20 | `results.spec.ts`: the date range changes the totals | Totals ignore the end date | Red: both range checks | Nothing needed |
| 21 | `results.spec.ts`: the viewer does not see the import | Import form shown to every role | Red | Nothing needed |
| 22 | `site.spec.ts`: four standard pages | Only 3 standard pages created | Red: "3 standard pages created" | Nothing needed |
| 23 | `site.spec.ts`: the wording check refuses "the best" | Removed "the best" from the compliance check | Red: the article published | Nothing needed |
| 24 | `tabs.spec.ts`: the client page shows each brand's business type | Every brand labelled "Affiliate marketing" | Red | Nothing needed |

`offers.spec.ts` was not sabotaged in this round. It had already failed against a real fault: the 0006 embedded-query bug fixed in commit `7dc4bb0`.

Run 12 is safe although the guard was broken: its Playwright check runs only `playwright test --list`, which lists test names without starting the application or connecting to any database.

## Known limits

**The Overview form key (run 15).** Each Overview form is keyed on its saved values, so a save redraws it from the server. This guards against cases a clean test browser does not produce: fields changed by a browser extension, as in the owner's Chrome during the increment 5 walkthrough, or React patching the old form instead of redrawing it. In Playwright's clean Chromium the saved values show correctly even without the key. A stronger test was tried (type the niche with spaces around it and expect the trimmed, saved value back); it also passed without the key, so it was not kept, because it would have claimed a protection it does not prove. The test still checks what the user must see: the saved values after a save and after F5. The key itself is covered only by the owner's manual check in his own Chrome.

**The results import test.** "The owner is offered the import, and it is refused without a ClickBank key" was not sabotaged. The natural break, removing the key check, would make the server call ClickBank's live API. The tests' request stop works only in the browser, so it cannot block a call made by the server. The check that no request left the browser does pass, and the import logic has its own unit tests.
