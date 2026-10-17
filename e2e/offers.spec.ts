// Walkthrough step 5 (O-02, O-03, O-05, C-03): add an offer and see its score;
// the offer cannot be approved before its rules record; approve both in order.
import { expect, test } from "@playwright/test";
import { alert, IDS, notice, signIn, snap } from "./support/helpers";

test("add Brain Training for Dogs, see its score, approve the rules and then the offer", async ({ page }) => {
  await signIn(page, "owner");
  await page.goto(`/brands/${IDS.affilyvault}/offers`);

  // The reference figures from the scoring tests: 48 out of 100, free traffic.
  await page.getByLabel("Offer name").fill("Brain Training for Dogs");
  await page.getByLabel("Payout per sale").fill("42.25");
  await page.getByLabel("Conversion rate").fill("0.40");
  await page.getByLabel("Earnings per click").fill("0.17");
  await page.getByLabel("Gravity").fill("14.92");
  await page.getByLabel("Does a sale keep paying?").selectOption("no");
  await page.getByLabel("Compliance risk").selectOption("low");
  await page.getByLabel("Seller restrictions").selectOption("low");
  await page.getByRole("button", { name: "Add and score offer" }).click();

  await expect(notice(page)).toHaveText("Brain Training for Dogs scored 48 out of 100.");
  const card = page.locator("ul.rows > li").filter({ hasText: "Brain Training for Dogs" });
  await expect(card.locator(".score")).toContainText("48");
  await expect(card.locator(".tag")).toHaveText("Free traffic");
  await snap(page, "offers-01-scored");

  // Refused: the seller's rules are not approved yet (C-03).
  await card.getByRole("button", { name: "Approve offer" }).click();
  await expect(alert(page)).toHaveText("Approve the seller's rules for this offer first.");
  await snap(page, "offers-02-approval-refused");

  await card.getByRole("button", { name: "Approve seller's rules" }).click();
  await expect(notice(page)).toHaveText("Seller's rules approved.");
  await expect(card.getByRole("button", { name: "Approve seller's rules" })).toHaveCount(0);

  await card.getByRole("button", { name: "Approve offer" }).click();
  await expect(notice(page)).toHaveText("Offer approved.");
  await expect(card).toContainText("Approved.");
  await expect(card.getByRole("button", { name: "Approve offer" })).toHaveCount(0);
  await snap(page, "offers-03-approved");
});
