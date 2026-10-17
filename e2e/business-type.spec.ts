// Walkthrough steps 15, 16 and 17 (T-07, T-06): switching Famperia to Both shows
// the affiliate tabs, switching back hides them, and each change is written to
// the audit log with who made it and the before and after values.
import { expect, test } from "@playwright/test";
import { AFFILIATE_TABS, dbAs, IDS, moduleBadge, notice, run, signIn, snap, tabs } from "./support/helpers";

async function famperiaAudit() {
  const db = await dbAs("owner");
  const { data, error } = await db
    .from("audit_log")
    .select("id, actor_id, actor_type, action, before, after")
    .eq("entity", "brands")
    .eq("entity_id", IDS.famperia)
    .order("id");
  if (error) throw new Error(error.message);
  return data ?? [];
}

// Leave Famperia as the migrations set it, even if a step below fails.
test.afterAll(async () => {
  await (await dbAs("owner")).from("brands").update({ business_type: "dropshipping" }).eq("id", IDS.famperia);
});

test("Famperia switched to Both and back, with two audit entries", async ({ page }) => {
  const before = await famperiaAudit();

  await signIn(page, "owner");
  await page.goto(`/brands/${IDS.famperia}`);
  await expect(tabs(page)).toHaveText(["Overview"]);

  // Both: the affiliate tabs appear and the screens open.
  await page.getByRole("radio", { name: /^Both/ }).check();
  await page.getByRole("button", { name: "Save business type" }).click();
  await expect(notice(page)).toHaveText("Business type set to Both.");
  await expect(tabs(page)).toHaveText(AFFILIATE_TABS);
  await expect(moduleBadge(page, "Affiliate marketing")).toHaveText("On");
  await expect(moduleBadge(page, "Dropshipping")).toHaveText("On");
  await snap(page, "business-type-01-both");
  await tabs(page).filter({ hasText: "Offers" }).click();
  await expect(page.getByRole("heading", { name: "Add an offer" })).toBeVisible();
  await snap(page, "business-type-02-both-offers-open");

  // Back to Dropshipping: the tabs are hidden again.
  await page.goto(`/brands/${IDS.famperia}`);
  await page.getByRole("radio", { name: /^Dropshipping/ }).check();
  await page.getByRole("button", { name: "Save business type" }).click();
  await expect(notice(page)).toHaveText("Business type set to Dropshipping.");
  await expect(tabs(page)).toHaveText(["Overview"]);
  await expect(moduleBadge(page, "Affiliate marketing")).toHaveText("Off");
  await snap(page, "business-type-03-back-to-dropshipping");

  // Exactly two new audit entries, in order, by the owner.
  const owner = await dbAs("owner");
  const { data: me } = await owner.auth.getUser();
  const added = (await famperiaAudit()).filter((row) => !before.some((old) => old.id === row.id));
  expect(added.map((row) => [row.before?.business_type, row.after?.business_type])).toEqual([
    ["dropshipping", "both"],
    ["both", "dropshipping"],
  ]);
  for (const row of added) {
    expect(row).toMatchObject({ action: "update", actor_type: "user", actor_id: me.user?.id });
  }
  expect(me.user?.email).toBe(run().users.owner.email);
});
