// Walkthrough steps 3 and 4 (T-07, O-01, O-07, C-01): each save on the brand's
// Overview shows its message and the saved values at once, a second save works
// the same way, and a reload (F5) still shows the saved values.
import { expect, test, type Page } from "@playwright/test";
import { IDS, notice, signIn, snap } from "./support/helpers";

const stamp = Date.now().toString(36);

// By role: the label "Niche" also matches the "Niche and platforms" section.
const nicheField = (page: Page) => page.getByRole("textbox", { name: /^Niche/ });
const checkbox = (page: Page, name: string) => page.getByRole("checkbox", { name: new RegExp(`^${name}`) });

test("the three saves on AffilyVault's Overview", async ({ page }) => {
  await signIn(page, "owner");
  await page.goto(`/brands/${IDS.affilyvault}`);

  // 1. Niche and platforms.
  await nicheField(page).fill(`Dog training ${stamp}`);
  await checkbox(page, "Pinterest").check();
  await page.getByRole("button", { name: "Save choices" }).click();
  await expect(notice(page)).toHaveText("Choices saved.");
  await expect(nicheField(page)).toHaveValue(`Dog training ${stamp}`);
  await expect(checkbox(page, "Pinterest")).toBeChecked();
  await snap(page, "overview-01-choices-saved");

  // Saving a second time, with different values, shows them too.
  await nicheField(page).fill(`Dog training, second save ${stamp}`);
  await checkbox(page, "Articles on the site").check();
  await page.getByRole("button", { name: "Save choices" }).click();
  await expect(notice(page)).toHaveText("Choices saved.");
  await expect(nicheField(page)).toHaveValue(`Dog training, second save ${stamp}`);
  await expect(checkbox(page, "Articles on the site")).toBeChecked();
  await expect(checkbox(page, "Pinterest")).toBeChecked();

  // 2. Business details.
  await page.getByLabel("Operator name").fill("Vividha Marketing");
  await page.getByLabel("Contact email").fill(`hello+${stamp}@affilyvault.example`);
  await page.getByLabel("Address").fill("Kolkata, West Bengal, India");
  await page.getByLabel("Home page headline").fill(`Independent overviews of pet training courses ${stamp}`);
  await page.getByRole("button", { name: "Save business details" }).click();
  await expect(notice(page)).toHaveText("Business details saved.");
  await expect(page.getByLabel("Contact email")).toHaveValue(`hello+${stamp}@affilyvault.example`);
  await expect(page.getByLabel("Home page headline")).toHaveValue(`Independent overviews of pet training courses ${stamp}`);
  await snap(page, "overview-02-details-saved");

  // 3. Business type, saved unchanged: the confirmation still appears.
  await expect(page.getByRole("radio", { name: /^Affiliate marketing/ })).toBeChecked();
  await page.getByRole("button", { name: "Save business type" }).click();
  await expect(notice(page)).toHaveText("Business type set to Affiliate marketing.");
  await expect(page.getByRole("radio", { name: /^Affiliate marketing/ })).toBeChecked();
  await snap(page, "overview-03-type-saved");

  // F5: every saved value is still shown.
  await page.reload();
  await expect(nicheField(page)).toHaveValue(`Dog training, second save ${stamp}`);
  await expect(checkbox(page, "Pinterest")).toBeChecked();
  await expect(checkbox(page, "Articles on the site")).toBeChecked();
  await expect(checkbox(page, "YouTube")).not.toBeChecked();
  await expect(page.getByLabel("Operator name")).toHaveValue("Vividha Marketing");
  await expect(page.getByLabel("Address")).toHaveValue("Kolkata, West Bengal, India");
  await expect(page.getByLabel("Contact email")).toHaveValue(`hello+${stamp}@affilyvault.example`);
  await expect(page.getByRole("radio", { name: /^Affiliate marketing/ })).toBeChecked();
  await snap(page, "overview-04-after-reload");
});
