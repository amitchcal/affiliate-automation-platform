// Walkthrough steps 12, 13 and 14 (T-07): Famperia is a dropshipping brand, so
// every affiliate screen refuses with a plain message, its public site does not
// exist, and the database refuses an affiliate write even when a signed-in
// request skips the screens altogether.
import { expect, test } from "@playwright/test";
import { alert, dbAs, IDS, signIn, snap } from "./support/helpers";

const REFUSAL =
  "Famperia is set up for dropshipping, so its affiliate marketing features are switched off. " +
  "To use them, change the business type on the brand's Overview.";

const AFFILIATE_PATHS = ["offers", "site", "results", "pages/00000000-0000-4000-8000-000000000000"];

for (const path of AFFILIATE_PATHS) {
  test(`/${path.split("/")[0]} is refused for Famperia with the message`, async ({ page }) => {
    await signIn(page, "owner");
    await page.goto(`/brands/${IDS.famperia}/${path}`);
    await expect(alert(page)).toHaveText(REFUSAL);
    await expect(page.getByRole("link", { name: "Go to the brand's Overview" })).toBeVisible();
    await snap(page, `famperia-refused-${path.split("/")[0]}`);
  });
}

test("Famperia has no public affiliate site", async ({ page }) => {
  const response = await page.goto("/site/famperia.com");
  expect(response?.status()).toBe(404);
  await snap(page, "famperia-no-public-site");
});

test("the database refuses a Famperia offer from a signed-in request that skips the screens", async () => {
  for (const role of ["owner", "clientAdmin"] as const) {
    const db = await dbAs(role);
    const { data, error } = await db
      .from("offers")
      .insert({ client_id: IDS.vividha, brand_id: IDS.famperia, name: "Should be refused", network: "clickbank" })
      .select("id");
    expect(data, `${role} must not create the offer`).toBeNull();
    expect(error?.message).toContain("Refused: Famperia is set up for dropshipping");
  }
  const { data: offers } = await (await dbAs("owner")).from("offers").select("id").eq("brand_id", IDS.famperia);
  expect(offers).toEqual([]);
});
