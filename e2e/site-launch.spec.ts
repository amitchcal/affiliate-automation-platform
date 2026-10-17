// Batch 2 (S-01, S-08): a site goes live only on a proven domain, visitors see
// only live sites on their own hosts, previews need a member of the client,
// and email sign-up stores the exact consent wording. No real DNS is used: the
// application reads a fake DNS file (allowed only against the local stack),
// and the test browser sends the test hosts to the local application.
//
// What this does not prove: real DNS propagation, Vercel's own domain setup,
// or TLS on a real domain.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { LAUNCH_REFUSALS, SIGNUP_MESSAGES } from "../src/modules/affiliate/site/launch";
import {
  alert,
  brandUrl,
  hostCode,
  IDS,
  notice,
  postForm,
  proveHost,
  rawGet,
  serverFormFields,
  setDns,
  signIn,
  snap,
  sqlOnTestDatabase,
  type Role,
} from "./support/helpers";
import { DNS_TARGETS } from "../scripts/e2e-lib.mjs";

test.describe.configure({ mode: "serial" });

const L1 = { id: "66666666-6666-4666-8666-666666666661", name: "Launch One", host: "launch-one-e2e.com", client: IDS.vividha };
const L2 = { id: "66666666-6666-4666-8666-666666666662", name: "Launch Two", host: "launch-two-e2e.com", client: IDS.separationClient };
const L3 = { id: "66666666-6666-4666-8666-666666666663", name: "Launch Three", host: "launch-three-e2e.com", client: IDS.vividha };
const LINKS = "go.launch-one-e2e.com";
const OFFER = "66666666-6666-4666-8666-666666666671";
const site = (brand: { id: string }) => `/brands/${brand.id}/site`;
const section = (page: Page, id: string) => page.locator(`section[aria-labelledby=${id}]`);
const hostRow = (page: Page, host: string) => section(page, "domains").locator(`li[data-host="${host}"]`);
const check = (page: Page, key: string) => section(page, "launch").locator(`[data-check="${key}"]`);

async function as(browser: Browser, role: Role) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, role);
  return page;
}

const publishPagesInDatabase = (brandId: string) =>
  sqlOnTestDatabase(
    `update site_pages set status = 'published', published_title = title, published_body = draft_body, published_at = now()
      where brand_id = '${brandId}' and status = 'draft'`,
  );

test.beforeAll(() => {
  const details = (name: string) =>
    `'{"operator":"Operator ${name}","address":"1 Main Street","email":"hello@${name.toLowerCase().replace(" ", "-")}-e2e.com"}'`;
  sqlOnTestDatabase(`
    insert into brands (id, client_id, name, domain, business_type, profile) values
      ('${L1.id}', '${L1.client}', '${L1.name}', '${L1.host}', 'affiliate', ${details("Launch One")}),
      ('${L2.id}', '${L2.client}', '${L2.name}', '${L2.host}', 'affiliate', ${details("Launch Two")}),
      ('${L3.id}', '${L3.client}', '${L3.name}', '${L3.host}', 'affiliate', '{}');
    insert into offers (id, client_id, brand_id, name, network, affiliate_link)
      values ('${OFFER}', '${L1.client}', '${L1.id}', 'Launch Offer', 'clickbank', 'https://seller.example/launch');
    insert into offer_rules (offer_id, client_id, compliance_risk, seller_restrictions, approved)
      values ('${OFFER}', '${L1.client}', 'low', 'low', true);
    update offers set status = 'approved' where id = '${OFFER}';
    insert into tracked_links (client_id, brand_id, offer_id, slug, destination, channel)
      values ('${L1.client}', '${L1.id}', '${OFFER}', 'launch-offer', 'https://seller.example/launch', 'site');
  `);
});

test("1. Set up site: refused without business details; with them, a draft site and four draft pages", async ({ browser }) => {
  const page = await as(browser, "owner");
  await page.goto(site(L3));
  await page.getByRole("button", { name: "Set up site" }).click();
  await expect(alert(page)).toHaveText(LAUNCH_REFUSALS.site_details_missing);

  await page.goto(site(L1));
  await expect(section(page, "launch").locator("[data-site-status]")).toHaveText("No site yet.");
  await page.getByRole("button", { name: "Set up site" }).click();
  await expect(notice(page)).toHaveText("4 standard pages created as drafts. Review and publish each one.");
  await expect(section(page, "launch").locator("[data-site-status]")).toHaveText("Draft: not visible to the public.");
  await expect(section(page, "standard").locator("ul.rows strong")).toHaveText([
    "Affiliate Disclosure",
    "Privacy Policy",
    "Terms of Use",
    "Contact",
  ]);
  await snap(page, "launch-01-set-up");
});

test("2. Domains: names are checked; each DNS problem is named; another person's crafted check is refused", async ({ browser }) => {
  const page = await as(browser, "owner");
  await page.goto(site(L1));
  const add = async (host: string, purpose: "Site" | "Links only" = "Site") => {
    const form = section(page, "domains").locator("form").filter({ hasText: "Add domain" });
    await form.getByLabel("Domain").fill(host);
    await form.getByLabel(purpose).check();
    await form.getByRole("button", { name: "Add domain" }).click();
  };
  await add("localhost");
  await expect(alert(page)).toHaveText("That is an internal or reserved name. Enter a public domain name such as example.com.");
  await add("https://launch-one-e2e.com/");
  await expect(alert(page)).toContainText("without https://");
  await add("192.168.1.10");
  await expect(alert(page)).toHaveText("Enter a domain name, not an IP address.");
  await add("app.affiqube.com");
  await expect(alert(page)).toHaveText("Affiqube's own domains cannot be used for a brand.");

  // The brand's own domain as a Site, and the Links host.
  await add(L1.host);
  await expect(notice(page)).toHaveText(`${L1.host} added. Add the DNS records shown, then press Check domain.`);
  await expect(hostRow(page, L1.host)).toContainText("Site, waiting for a domain check");
  await add(L1.host);
  await expect(alert(page)).toHaveText(`${L1.host} is already on this brand.`);
  await add(LINKS, "Links only");
  await expect(notice(page)).toHaveText(`${LINKS} added. Add the DNS records shown, then press Check domain.`);
  const records = hostRow(page, L1.host).getByLabel(`DNS records for ${L1.host}`);
  const code = hostCode(L1.host, L1.id);
  await expect(records).toContainText(`Type TXT, name _affiqube.${L1.host}, value ${code}`);
  await expect(records).toContainText(`Type CNAME, name ${L1.host}, value ${DNS_TARGETS.cname}`);

  // A crafted Check domain from the client admin (not allowed to check) is refused before any lookup.
  proveHost(L1.host, code);
  const fields = await serverFormFields(page, site(L1), "Check domain");
  const admin = await as(browser, "clientAdmin");
  const crafted = await postForm(admin, site(L1), { ...fields, domain_id: sqlOnTestDatabase(`select id from brand_domains where host = '${L1.host}'`) });
  expect(crafted.status()).toBeLessThan(400);
  expect(sqlOnTestDatabase(`select status from brand_domains where host = '${L1.host}'`)).toBe("pending");

  const press = async (host: string) => hostRow(page, host).getByRole("button", { name: "Check domain" }).click();
  setDns(L1.host, {});
  await page.goto(site(L1));
  await press(L1.host);
  await expect(alert(page)).toHaveText(
    `The TXT record _affiqube.${L1.host} was not found. DNS changes can take up to a few hours; try again later.`,
  );
  setDns(L1.host, {}, { txt: ["a-code-from-another-row"] });
  await press(L1.host);
  await expect(alert(page)).toHaveText(`The TXT record _affiqube.${L1.host} has a different value. It must be exactly the code shown.`);
  setDns(L1.host, { cname: ["somewhere-else.example"] }, { txt: [code] });
  await press(L1.host);
  await expect(alert(page)).toHaveText(`${L1.host} does not point at Affiqube yet. Add the CNAME (or A) record shown.`);
  proveHost(L1.host, code);
  await press(L1.host);
  await expect(notice(page)).toHaveText(`${L1.host} is verified.`);
  proveHost(LINKS, hostCode(LINKS, L1.id));
  await press(LINKS);
  await expect(notice(page)).toHaveText(`${LINKS} is verified.`);
  await snap(page, "launch-02-domains");
});

test("3. The checklist names what is missing; a crafted Go live is refused; then the site goes live, audited", async ({ browser }) => {
  const page = await as(browser, "owner");
  await page.goto(site(L1));
  await expect(check(page, "standard_pages")).toHaveAttribute("data-passed", "no");
  await expect(check(page, "standard_pages")).toContainText("Publish the standard pages first: Affiliate Disclosure, Privacy Policy, Terms of Use, Contact.");
  await expect(check(page, "domain")).toHaveAttribute("data-passed", "yes");
  await expect(section(page, "launch").getByRole("button", { name: "Go live" })).toBeDisabled();

  const fields = await serverFormFields(page, site(L1), "Go live");
  const crafted = await postForm(page, site(L1), fields);
  expect(decodeURIComponent(crafted.headers()["location"] ?? "")).toContain(LAUNCH_REFUSALS.site_not_ready);
  expect(sqlOnTestDatabase(`select status from aff_sites where brand_id = '${L1.id}'`)).toBe("draft");

  publishPagesInDatabase(L1.id);
  await page.goto(site(L1));
  await section(page, "launch").getByRole("button", { name: "Go live" }).click();
  await expect(notice(page)).toHaveText("The site is live. Visitors can now see it on its verified domain.");
  expect(sqlOnTestDatabase(`select count(*) from audit_log where action = 'site_go_live' and entity_id = '${L1.id}'`)).toBe("1");
  await snap(page, "launch-03-live");
});

test("4. Two live brands on two hosts each show only their own name, pages, and links (S01-7)", async ({ browser }) => {
  const page = await as(browser, "owner");
  await page.goto(site(L2));
  await page.getByRole("button", { name: "Set up site" }).click();
  await expect(notice(page)).toContainText("standard pages created as drafts");
  publishPagesInDatabase(L2.id);
  await page.goto(site(L2));
  const form = section(page, "domains").locator("form").filter({ hasText: "Add domain" });
  await form.getByLabel("Domain").fill(L2.host);
  await form.getByRole("button", { name: "Add domain" }).click();
  await expect(notice(page)).toContainText(`${L2.host} added.`);
  proveHost(L2.host, hostCode(L2.host, L2.id));
  await hostRow(page, L2.host).getByRole("button", { name: "Check domain" }).click();
  await expect(notice(page)).toHaveText(`${L2.host} is verified.`);
  await section(page, "launch").getByRole("button", { name: "Go live" }).click();
  await expect(notice(page)).toContainText("The site is live.");

  const visitor = await (await browser.newContext()).newPage();
  const one = await visitor.goto(brandUrl(L1.host));
  expect(one?.status()).toBe(200);
  await expect(visitor.locator(".site-header .name")).toHaveText(L1.name);
  await expect(visitor.locator("body")).not.toContainText(L2.name);
  const two = await visitor.goto(brandUrl(L2.host));
  expect(two?.status()).toBe(200);
  await expect(visitor.locator(".site-header .name")).toHaveText(L2.name);
  await expect(visitor.locator("body")).not.toContainText(L1.name);
  // Mixed case is the same host.
  const mixed = await rawGet("LAUNCH-ONE-E2E.COM:3100", "/");
  expect(mixed.status).toBe(200);
  expect(mixed.body).toContain(L1.name);
  // A brand's link works on its own host only.
  expect((await rawGet(L2.host, "/go/launch-offer")).status).toBe(404);
  await snap(visitor, "launch-04-brand-one");
});

test("5. Unknown, look-alike, empty and unlisted hosts get 404 'This site is not available', never another brand", async () => {
  for (const host of ["unknown-e2e.com", `${L1.host}.evil-e2e.com`, `evil-${L1.host}`, `www.${L1.host}`, L3.host, "", "127.0.0.2"]) {
    const response = await rawGet(host, "/");
    expect(response.status, host).toBe(404);
    expect(response.body, host).toContain("This site is not available.");
    for (const name of [L1.name, L2.name, L3.name, "AffilyVault", "Famperia"]) expect(response.body, `${host} names ${name}`).not.toContain(name);
    expect((await rawGet(host, "/privacy")).status, `${host}/privacy`).toBe(404);
    expect((await rawGet(host, "/go/launch-offer")).status, `${host}/go`).toBe(404);
  }
});

test("6. The Links host redirects and records the click, and shows nothing else", async () => {
  const before = Number(sqlOnTestDatabase(`select count(*) from click_events where brand_id = '${L1.id}'`));
  const response = await rawGet(LINKS, "/go/launch-offer");
  expect(response.status).toBe(302);
  expect(response.location).toMatch(/^https:\/\/seller\.example\/launch\?tid=[0-9a-f]{8}$/);
  expect(Number(sqlOnTestDatabase(`select count(*) from click_events where brand_id = '${L1.id}'`))).toBe(before + 1);
  const home = await rawGet(LINKS, "/");
  expect(home.status).toBe(404);
  expect(home.body).not.toContain(L1.name);
});

test("7. Preview: signed out, not available; a member of the client sees it; another client does not", async ({ browser }) => {
  const visitor = await (await browser.newContext()).newPage();
  const signedOut = await visitor.goto(`/site/${L3.host}`);
  expect(signedOut?.status()).toBe(404);
  await expect(visitor.getByRole("heading", { name: "This site is not available." })).toBeVisible();

  const viewer = await as(browser, "clientViewer");
  await viewer.goto(`/site/${L1.host}`);
  await expect(viewer.locator(".site-header .name")).toHaveText(L1.name);
  await expect(viewer.locator(".site-footer")).toContainText("Preview.");
  const other = await as(browser, "otherAdmin");
  const refused = await other.goto(`/site/${L1.host}`);
  expect(refused?.status()).toBe(404);
  await expect(other.locator("body")).not.toContainText(L1.name);

  // A preview click shows where the link goes and records nothing.
  const before = sqlOnTestDatabase(`select count(*) from click_events where brand_id = '${L1.id}'`);
  const click = await viewer.request.get(`/site/${L1.host}/go/launch-offer`, { maxRedirects: 0 });
  expect(click.status()).toBe(302);
  expect(click.headers()["location"]).toBe("https://seller.example/launch");
  expect(sqlOnTestDatabase(`select count(*) from click_events where brand_id = '${L1.id}'`)).toBe(before);
});

test("8. A client admin cannot go live (crafted request refused) but can take the site offline", async ({ browser }) => {
  const admin = await as(browser, "clientAdmin");
  await admin.goto(site(L1));
  await expect(section(admin, "launch").getByRole("button", { name: "Go live" })).toHaveCount(0);
  await section(admin, "launch").getByRole("button", { name: "Take offline" }).click();
  await expect(notice(admin)).toContainText("The site is offline.");
  expect((await rawGet(L1.host, "/")).status).toBe(404);

  const owner = await as(browser, "owner");
  const fields = await serverFormFields(owner, site(L1), "Go live");
  const crafted = await postForm(admin, site(L1), fields);
  expect(decodeURIComponent(crafted.headers()["location"] ?? "")).toContain(LAUNCH_REFUSALS.site_not_allowed);
  expect(sqlOnTestDatabase(`select status from aff_sites where brand_id = '${L1.id}'`)).toBe("offline");

  await owner.goto(site(L1));
  await section(owner, "launch").getByRole("button", { name: "Go live" }).click();
  await expect(notice(owner)).toContainText("The site is live.");
  expect((await rawGet(L1.host, "/")).status).toBe(200);
});

test("9. Sign-up: needs the current policy; the policy stays published; consent stored exactly; repeats and bots stored once or not at all", async ({ browser }) => {
  const owner = await as(browser, "owner");
  // The brand's policy on the old template version (as for a brand set up before 0012).
  sqlOnTestDatabase(`select set_config('affiqube.template_fill', 'on', false);
    update site_pages set template_version = 1 where brand_id = '${L1.id}' and template_key = 'privacy';
    update site_pages set published_body = draft_body where brand_id = '${L1.id}' and template_key = 'privacy';`);
  await owner.goto(site(L1));
  await section(owner, "signup").getByRole("button", { name: "Turn sign-up on" }).click();
  await expect(alert(owner)).toHaveText(LAUNCH_REFUSALS.signup_privacy_outdated);

  // The policy page of a live site cannot be unpublished (owner's review change 1).
  await section(owner, "standard").getByRole("link", { name: "Privacy Policy", exact: true }).click();
  await owner.getByRole("button", { name: "Unpublish" }).click();
  await expect(alert(owner)).toHaveText(LAUNCH_REFUSALS.page_site_live);

  // Update from template, review, publish; then sign-up can be turned on.
  await owner.goto(site(L1));
  await owner.locator('[data-outdated="privacy"]').getByRole("button", { name: "Update from template" }).click();
  await expect(notice(owner)).toContainText("The draft now has the current template wording.");
  await owner.getByRole("button", { name: "Publish changes" }).click();
  await expect(notice(owner)).toHaveText("Published.");
  await owner.goto(site(L1));
  await section(owner, "signup").getByRole("button", { name: "Turn sign-up on" }).click();
  await expect(notice(owner)).toHaveText("Email sign-up is on. The form shows on the home page and in the footer.");

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(brandUrl(L1.host));
  const form = visitor.locator("#signup form");
  await expect(form.getByRole("checkbox")).not.toBeChecked();
  const wording = sqlOnTestDatabase(`select replace(body, '{{brand}}', '${L1.name}') from consent_texts where key = 'email_signup' and version = 1`);
  await expect(visitor.locator("#signup .consent")).toHaveText(wording);
  await snap(visitor, "launch-09-signup-form");

  // Not ticked: refused, nothing stored.
  await form.getByLabel("Email", { exact: true }).fill("pat@example.com");
  await form.getByRole("button", { name: "Sign up" }).click();
  await expect(visitor.locator("#signup [role=alert]")).toHaveText(SIGNUP_MESSAGES.signup_no_consent);
  expect(sqlOnTestDatabase(`select count(*) from subscribers where brand_id = '${L1.id}'`)).toBe("0");

  // Ticked: stored with the exact wording, its version, the time and the page.
  await visitor.locator("#signup form").getByLabel("Email", { exact: true }).fill("Pat@Example.com");
  await visitor.locator("#signup form").getByRole("checkbox").check();
  await visitor.locator("#signup form").getByRole("button", { name: "Sign up" }).click();
  await expect(visitor.locator("#signup [role=status]")).toHaveText(SIGNUP_MESSAGES.done);
  expect(
    sqlOnTestDatabase(
      `select email || '|' || consent_version || '|' || source_host || '|' || source_page || '|' || status || '|' || (consent_text = $w$${wording}$w$)
         from subscribers where brand_id = '${L1.id}'`,
    ),
  ).toBe(`pat@example.com|1|${L1.host}|home|pending|true`);
  const firstTime = sqlOnTestDatabase(`select consented_at from subscribers where brand_id = '${L1.id}'`);

  // The same address again: the same message, still one record, the original time kept.
  await visitor.goto(brandUrl(L1.host, "/privacy"));
  await visitor.locator("#signup form").getByLabel("Email", { exact: true }).fill("pat@example.com");
  await visitor.locator("#signup form").getByRole("checkbox").check();
  await visitor.locator("#signup form").getByRole("button", { name: "Sign up" }).click();
  await expect(visitor.locator("#signup [role=status]")).toHaveText(SIGNUP_MESSAGES.done);
  expect(sqlOnTestDatabase(`select count(*) || '|' || max(consented_at) from subscribers where brand_id = '${L1.id}'`)).toBe(`1|${firstTime}`);

  // The honeypot filled (a bot): the same message, nothing stored.
  await visitor.goto(brandUrl(L1.host));
  await visitor.locator("#signup form").getByLabel("Email", { exact: true }).fill("bot@example.com");
  await visitor.locator("#signup form").getByRole("checkbox").check();
  await visitor.locator('#signup input[name="website"]').fill("http://spam.example", { force: true });
  await visitor.locator("#signup form").getByRole("button", { name: "Sign up" }).click();
  await expect(visitor.locator("#signup [role=status]")).toHaveText(SIGNUP_MESSAGES.done);
  expect(sqlOnTestDatabase(`select count(*) from subscribers where email = 'bot@example.com'`)).toBe("0");

  // The wording changes while the form is open (owner's review change 4): refused, nothing stored.
  await visitor.goto(brandUrl(L1.host));
  sqlOnTestDatabase(`insert into consent_texts (key, version, body) values ('email_signup', 2, 'Version two of the wording for {{brand}}.')`);
  await visitor.locator("#signup form").getByLabel("Email", { exact: true }).fill("late@example.com");
  await visitor.locator("#signup form").getByRole("checkbox").check();
  await visitor.locator("#signup form").getByRole("button", { name: "Sign up" }).click();
  await expect(visitor.locator("#signup [role=alert]")).toHaveText(SIGNUP_MESSAGES.signup_wording_changed);
  expect(sqlOnTestDatabase(`select count(*) from subscribers where email = 'late@example.com'`)).toBe("0");
  await visitor.goto(brandUrl(L1.host));
  await expect(visitor.locator("#signup .consent")).toHaveText(`Version two of the wording for ${L1.name}.`);
  sqlOnTestDatabase(`delete from consent_texts where key = 'email_signup' and version = 2`);

  // The policy no longer current (owner's review change 3): the form disappears.
  sqlOnTestDatabase(`update compliance_templates set version = 3 where key = 'privacy'`);
  await visitor.goto(brandUrl(L1.host));
  await expect(visitor.locator("#signup")).toHaveCount(0);
  sqlOnTestDatabase(`update compliance_templates set version = 2 where key = 'privacy'`);
  await visitor.goto(brandUrl(L1.host));
  await expect(visitor.locator("#signup form")).toBeVisible();
});

test("10. Subscribers: the admin sees the address, a viewer the count only; the owner deletes and no address remains", async ({ browser }) => {
  const admin = await as(browser, "clientAdmin");
  await admin.goto(site(L1));
  await expect(section(admin, "signup").getByLabel("Subscribers")).toContainText("pat@example.com");
  await expect(section(admin, "signup").getByRole("button", { name: /^Delete/ })).toHaveCount(0);

  const viewer = await as(browser, "clientViewer");
  await viewer.goto(site(L1));
  await expect(section(viewer, "signup").locator("[data-subscriber-count]")).toHaveText("Subscribers: 1");
  await expect(section(viewer, "signup")).not.toContainText("pat@example.com");

  const owner = await as(browser, "owner");
  await owner.goto(site(L1));
  await section(owner, "signup").getByRole("button", { name: "Delete pat@example.com" }).click();
  await expect(notice(owner)).toHaveText("Subscriber deleted. Their email address is no longer stored.");
  expect(sqlOnTestDatabase(`select count(*) from subscribers where email = 'pat@example.com'`)).toBe("0");
  expect(sqlOnTestDatabase(`select count(*) from audit_log where action = 'subscriber_deleted' and client_id = '${L1.client}'`)).toBe("1");
  expect(sqlOnTestDatabase(`select count(*) from audit_log where to_jsonb(audit_log)::text ilike '%pat@example.com%'`)).toBe("0");
});

test("11. A failed re-check of a live domain warns, keeps the site up, and blocks going live again", async ({ browser }) => {
  const owner = await as(browser, "owner");
  setDns(L2.host, { cname: ["somewhere-else.example"] }, { txt: [hostCode(L2.host, L2.id)] });
  await owner.goto(site(L2));
  await hostRow(owner, L2.host).getByRole("button", { name: "Check domain" }).click();
  await expect(owner.locator('p[data-warning="domain-check"]')).toContainText(`Domain check failed for ${L2.host}`);
  expect((await rawGet(L2.host, "/")).status).toBe(200);

  await owner.goto(`/brands/${L2.id}`);
  await expect(owner.locator('p[data-warning="domain-check"]')).toContainText("The site is still live.");
  await owner.goto(`/clients/${L2.client}`);
  await expect(owner.locator('p[data-warning="domain-check"]')).toContainText(L2.host);

  // Offline, it cannot go live again until the domain passes.
  await owner.goto(site(L2));
  await section(owner, "launch").getByRole("button", { name: "Take offline" }).click();
  await expect(check(owner, "domain")).toHaveAttribute("data-passed", "no");
  await expect(section(owner, "launch").getByRole("button", { name: "Go live" })).toBeDisabled();
  proveHost(L2.host, hostCode(L2.host, L2.id));
  await hostRow(owner, L2.host).getByRole("button", { name: "Check domain" }).click();
  await expect(notice(owner)).toHaveText(`${L2.host} is verified.`);
  await expect(owner.locator('p[data-warning="domain-check"]')).toHaveCount(0);
  await expect(section(owner, "launch").getByRole("button", { name: "Go live" })).toBeEnabled();
});
