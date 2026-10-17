// Walkthrough step 10 (P-02, P-03, P-01): the date range changes the totals;
// the import is offered to the owner, refused without a ClickBank key, and
// hidden from the client viewer. Sales come from e2e/seed.sql on fixed dates.
import { expect, test, type Page } from "@playwright/test";
import { alert, IDS, signIn, snap, stopOutsideRequests } from "./support/helpers";

async function showRange(page: Page, since: string, until: string) {
  const range = page.locator('form[method="get"]');
  await range.getByLabel("From", { exact: true }).fill(since);
  await range.getByLabel("to", { exact: true }).fill(until);
  await range.getByRole("button", { name: "Update" }).click();
  await expect(page).toHaveURL(new RegExp(`since=${since}&until=${until}`));
  // Within the results section: the brand header above it has its own p.lede.
  await expect(page.locator("section[aria-labelledby=summary] p.lede")).toContainText(`${since} to ${until}.`);
}

/** The three totals as shown: clicks, sales, net commission. */
const totals = (page: Page) => page.locator("section[aria-labelledby=summary] .panel.grid > div > div:first-child");

test("the date range changes the totals", async ({ page }) => {
  await signIn(page, "owner");
  await page.goto(`/brands/${IDS.affilyvault}/results`);

  await showRange(page, "2026-09-01", "2026-09-30");
  await expect(totals(page)).toHaveText(["0", "1", "$25.00"]);
  await snap(page, "results-01-september");

  // Two sales and a refund of one; the $999 test order is not counted.
  await showRange(page, "2026-10-01", "2026-10-10");
  await expect(totals(page)).toHaveText(["0", "2", "$30.00"]);
  await expect(page.locator("table.links tbody tr").filter({ hasText: "Pet Sleep Guide" })).toContainText("$30.00");
  await snap(page, "results-02-early-october");

  await showRange(page, "2026-09-01", "2026-10-10");
  await expect(totals(page)).toHaveText(["0", "3", "$55.00"]);
});

test("the owner is offered the import, and it is refused without a ClickBank key", async ({ page }) => {
  const stopped = await stopOutsideRequests(page);
  await signIn(page, "owner");
  await page.goto(`/brands/${IDS.affilyvault}/results`);
  await expect(page.getByRole("heading", { name: "Import sales" })).toBeVisible();
  await page.getByRole("button", { name: "Import sales from ClickBank" }).click();
  await expect(alert(page)).toHaveText("CLICKBANK_API_KEY is not set");
  expect(stopped).toEqual([]);
  await snap(page, "results-03-import-refused-without-key");
});

test("the client viewer sees the results but not the import", async ({ page }) => {
  await signIn(page, "clientViewer");
  await page.goto(`/brands/${IDS.affilyvault}/results`);
  await showRange(page, "2026-09-01", "2026-09-30");
  await expect(totals(page)).toHaveText(["0", "1", "$25.00"]);
  await expect(page.getByRole("heading", { name: "Import sales" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Import sales from ClickBank" })).toHaveCount(0);
  await snap(page, "results-04-viewer-no-import");
});
