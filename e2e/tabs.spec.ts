// Walkthrough steps 1, 2 and 11 (T-07): each brand shows the tabs of the modules it has.
import { expect, test } from "@playwright/test";
import { AFFILIATE_TABS, IDS, moduleBadge, signIn, snap, tabs } from "./support/helpers";

test.beforeEach(async ({ page }) => {
  await signIn(page, "owner");
});

test("the client lists both test brands with their business types", async ({ page }) => {
  await page.getByRole("link", { name: /Vividha Marketing/ }).click();
  await expect(page.getByRole("link", { name: /AffilyVault/ })).toContainText("Affiliate marketing, affilyvault.com");
  await expect(page.getByRole("link", { name: /Famperia/ })).toContainText("Dropshipping, famperia.com");
  await snap(page, "tabs-01-client-brands");
});

test("AffilyVault shows the four affiliate tabs, with Affiliate On and Dropshipping Off", async ({ page }) => {
  await page.goto(`/brands/${IDS.affilyvault}`);
  await expect(tabs(page)).toHaveText(AFFILIATE_TABS);
  await expect(moduleBadge(page, "Affiliate marketing")).toHaveText("On");
  await expect(moduleBadge(page, "Dropshipping")).toHaveText("Off");
  await snap(page, "tabs-02-affilyvault");
});

test("Famperia shows the Overview only, with Affiliate Off and Dropshipping On", async ({ page }) => {
  await page.goto(`/brands/${IDS.famperia}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Famperia");
  await expect(tabs(page)).toHaveText(["Overview"]);
  await expect(moduleBadge(page, "Affiliate marketing")).toHaveText("Off");
  await expect(moduleBadge(page, "Dropshipping")).toHaveText("On");
  await snap(page, "tabs-03-famperia");
});
