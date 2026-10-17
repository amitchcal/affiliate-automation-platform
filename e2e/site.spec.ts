// Walkthrough steps 6, 7, 8 and 9 (C-04, S-01, S-03, S-04, S-05, S-06, S-07, O-06, K-05):
// standard pages, an offer page with draft and publish, the wording check, the
// public site, a tracked click, and a new tracked link. The click's redirect to
// the seller is stopped inside the browser, so no outside site is called.
import { expect, test, type Page } from "@playwright/test";
import { alert, IDS, notice, signIn, snap, stopOutsideRequests } from "./support/helpers";

const SITE = `/brands/${IDS.affilyvault}/site`;
const PUBLIC = "/site/affilyvault.com";

const section = (page: Page, id: string) => page.locator(`section[aria-labelledby=${id}]`);
const pageRow = (page: Page, title: string) =>
  page.locator("ul.rows > li").filter({ has: page.getByRole("link", { name: title, exact: true }) });

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await signIn(page, "owner");
});

test("an offer page cannot publish before the four standard pages", async ({ page }) => {
  await page.goto(SITE);
  const form = section(page, "content").locator("form").filter({ hasText: "Pet Sleep Guide" });
  await expect(form.getByRole("textbox")).toHaveValue("https://seller.example/pet-sleep-guide");
  await form.getByRole("button", { name: "Create offer page" }).click();

  await expect(page.getByRole("heading", { name: "Pet Sleep Guide: Overview", level: 2 })).toBeVisible();
  await expect(page.locator("#check + .notice")).toHaveText("The saved draft passes the wording check.");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(alert(page)).toHaveText("Not published. Publish the four standard pages for this site first.");
  await snap(page, "site-01-offer-page-refused");
});

test("create and publish the four standard pages", async ({ page }) => {
  await page.goto(SITE);
  await page.getByRole("button", { name: "Create standard pages" }).click();
  await expect(notice(page)).toHaveText("4 standard pages created as drafts. Review and publish each one.");

  const titles = ["Affiliate Disclosure", "Privacy Policy", "Terms of Use", "Contact"];
  await expect(section(page, "standard").locator("ul.rows strong")).toHaveText(titles);
  for (const title of titles) {
    await page.goto(SITE);
    await section(page, "standard").getByRole("link", { name: title, exact: true }).click();
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(notice(page)).toHaveText("Published.");
  }
  await page.goto(SITE);
  for (const title of titles) await expect(pageRow(page, title).locator(".status")).toHaveText("Published");
  await expect(page.getByRole("button", { name: "Create standard pages" })).toHaveCount(0);
  await snap(page, "site-02-standard-published");
});

test("the offer page publishes, and a saved draft does not change what visitors see", async ({ page }) => {
  await page.goto(SITE);
  await section(page, "content").getByRole("link", { name: "Pet Sleep Guide: Overview" }).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(notice(page)).toHaveText("Published.");

  const summary = "An overview of Pet Sleep Guide, based on the seller's published information.";
  await page.getByLabel("Summary").fill(summary);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(notice(page)).toHaveText("Draft saved. Visitors still see the published version.");
  await expect(page.locator("main .split .status")).toHaveText("Published, with unpublished changes");
  await expect(page.getByLabel("Summary")).toHaveValue(summary);
  await snap(page, "site-03-draft-saved");

  const visitor = await page.context().newPage();
  await visitor.goto(`${PUBLIC}/pet-sleep-guide`);
  await expect(visitor.locator("article")).not.toContainText(summary);
  await visitor.close();

  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect(notice(page)).toHaveText("Published.");
  await expect(page.locator("main .split .status")).toHaveText("Published");
});

test("the wording check refuses an unsupported superlative in an article", async ({ page }) => {
  await page.goto(SITE);
  await page.getByLabel("New article title").fill("Choosing a dog crate");
  await page.getByRole("button", { name: "Create article" }).click();

  await page.getByLabel("Summary").fill("What to look for in a crate.");
  await page.getByLabel("Body").fill("This is the best crate guide on the internet.");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(alert(page)).toContainText("Not published. Change this wording first.");
  await expect(page.locator("main .split .status")).toHaveText("Draft");
  await snap(page, "site-04-wording-refused");

  await page.getByLabel("Body").fill("Measure your dog standing up, then add a few inches for comfort.");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(notice(page)).toHaveText("Published.");
});

test("the public site lists the pages, and a click is recorded before the seller", async ({ page }) => {
  const stopped = await stopOutsideRequests(page);
  await page.goto(PUBLIC);
  await expect(page.getByRole("link", { name: /Pet Sleep Guide: Overview/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Choosing a dog crate/ })).toBeVisible();
  await snap(page, "site-05-public-home");

  await page.goto(`${PUBLIC}/pet-sleep-guide`);
  await expect(page.locator("article")).toContainText("An overview of Pet Sleep Guide");
  await expect(page.locator(".disclosure")).toContainText("independent affiliate");
  await snap(page, "site-06-public-offer-page");

  // The button opens the seller in a new tab, where Chromium follows the
  // redirect past the browser's request stop. So the test requests the
  // button's own address without following redirects: the click is recorded,
  // and the redirect's target is checked without ever being visited.
  const button = page.getByRole("link", { name: "See it on the official site" }).first();
  const response = await page.request.get((await button.getAttribute("href"))!, {
    maxRedirects: 0,
    headers: { referer: page.url() },
  });
  expect(response.status()).toBe(302);
  expect(response.headers()["location"]).toMatch(/^https:\/\/seller\.example\/pet-sleep-guide\?tid=[0-9a-f]{8}$/);
  expect(stopped).toEqual([]);

  await page.goto(SITE);
  const siteLink = section(page, "links").locator("tbody tr").filter({ has: page.locator("td:nth-child(2)", { hasText: /^site$/ }) });
  await expect(siteLink.locator("td.num")).toHaveText("1");
  await snap(page, "site-07-click-recorded");
});

test("create a tracked link for another channel", async ({ page }) => {
  await page.goto(SITE);
  const form = section(page, "links").locator("form");
  await form.getByLabel("Offer").selectOption({ label: "Pet Sleep Guide" });
  await form.getByLabel("Channel").selectOption("email");
  await form.getByLabel("Campaign").fill("newsletter");
  await form.getByLabel("Creative").fill("headline-a");
  await form.getByRole("button", { name: "Create link" }).click();
  await expect(notice(page)).toHaveText("Link created.");
  const row = section(page, "links").locator("tbody tr").filter({ hasText: "/go/pet-sleep-guide-email-newsletter-headline-a" });
  await expect(row).toContainText("newsletter, headline-a");
  await expect(row.locator("td.num")).toHaveText("0");

  // The same channel, campaign and creative again is refused.
  await form.getByLabel("Offer").selectOption({ label: "Pet Sleep Guide" });
  await form.getByLabel("Channel").selectOption("email");
  await form.getByLabel("Campaign").fill("newsletter");
  await form.getByLabel("Creative").fill("headline-a");
  await form.getByRole("button", { name: "Create link" }).click();
  await expect(alert(page)).toHaveText("A link with the same channel, campaign, and creative already exists.");
  await snap(page, "site-08-link-created");
});
