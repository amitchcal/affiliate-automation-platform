// T-01, T-02, T-07: what each client role may and may not do, refused with a
// message the user can act on, and clients kept apart.
import { expect, test } from "@playwright/test";
import { alert, IDS, signIn, snap, tabs } from "./support/helpers";

test("a client viewer's saves are refused with a message", async ({ page }) => {
  await signIn(page, "clientViewer");
  await page.goto(`/brands/${IDS.affilyvault}`);
  const niche = page.getByRole("textbox", { name: /^Niche/ });
  const savedNiche = await niche.inputValue();

  await niche.fill("Changed by the viewer");
  await page.getByRole("button", { name: "Save choices" }).click();
  await expect(alert(page)).toHaveText("Choices were not saved. Your role may not allow it.");
  await expect(page.getByRole("textbox", { name: /^Niche/ })).toHaveValue(savedNiche);
  await snap(page, "roles-01-viewer-choices-refused");

  await page.getByLabel("Operator name").fill("Changed by the viewer");
  await page.getByRole("button", { name: "Save business details" }).click();
  await expect(alert(page)).toHaveText("Details were not saved. Your role may not allow it.");
  await expect(page.getByLabel("Operator name")).not.toHaveValue("Changed by the viewer");
});

test("a client admin cannot change the business type", async ({ page }) => {
  await signIn(page, "clientAdmin");
  await page.goto(`/brands/${IDS.famperia}`);
  await page.getByRole("radio", { name: /^Both/ }).check();
  await page.getByRole("button", { name: "Save business type" }).click();
  await expect(alert(page)).toHaveText(
    "The business type was not saved. Only the owner and operators can change it.",
  );
  await expect(page.getByRole("radio", { name: /^Dropshipping/ })).toBeChecked();
  await expect(tabs(page)).toHaveText(["Overview"]);
  await snap(page, "roles-02-admin-type-refused");
});

test("a client admin sees only their own client", async ({ page }) => {
  await signIn(page, "clientAdmin");
  await expect(page.getByRole("link", { name: /Vividha Marketing/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Separation Test Co/ })).toHaveCount(0);
});

test("the second client's admin cannot see Vividha's brands", async ({ page }) => {
  await signIn(page, "otherAdmin");
  await expect(page.getByRole("link", { name: /Separation Test Co/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Vividha Marketing/ })).toHaveCount(0);
  await snap(page, "roles-03-other-client-list");

  for (const path of [`/clients/${IDS.vividha}`, `/brands/${IDS.affilyvault}`, `/brands/${IDS.famperia}`]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.getByText("AffilyVault")).toHaveCount(0);
  }
  await snap(page, "roles-04-other-client-brand-not-found");
});
