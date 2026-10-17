// Increment 6 (T-05): two-factor sign-in, enforced by the database (0009).
// Turning it on, the code step at sign-in, being held on the setup screen,
// password-only requests getting no data, keeping one authenticator, the
// owner's reset, and recovery with supabase/recovery/remove_two_factor.sql.
// No phone is needed: the test computes the codes from the key shown during
// setup, as an authenticator app does (scripts/totp.mjs, checked against RFC 6238).
//
// What this does not prove: that a real phone app scans the QR code, a phone
// with a wrong clock, or the hosted project's own two-factor settings.
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { resetDoneMessage, TWO_FACTOR_MESSAGES } from "../src/core/two-factor";
import { alert, createAccount, dbAs, dbAsAccount, IDS, notice, run, signIn, snap, sqlOnTestDatabase } from "./support/helpers";
import { freshCode, totp } from "./support/totp";

test.describe.configure({ mode: "serial" });

const stamp = Date.now().toString(36);
const ADMIN = `tf-admin-${stamp}@example.com`;
const VIEWER = `tf-viewer-${stamp}@example.com`;
const HELD_VIEWER = `tf-viewer2-${stamp}@example.com`;
const RECOVER = `tf-recover-${stamp}@example.com`;
const OPERATOR = `tf-operator-${stamp}@example.com`;
const PASSWORD = `Two-factor-${stamp}-ok`;
const ids: Record<string, string> = {};

// Shared across the serial tests: the admin's current authenticator key and the codes already used with it.
let key = "";
const used: string[] = [];

async function signInAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function enterCode(page: Page, code: string) {
  await expect(page).toHaveURL(/\/login\/two-factor$/);
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Continue" }).click();
}

async function freshPage(browser: Browser) {
  return (await browser.newContext()).newPage();
}

const authenticatorRows = (page: Page) => page.locator("section[aria-labelledby=authenticators] ul.rows > li");
const HELD = /\/account\/security\?required=1$/;

/** Starts setup on the security screen and returns the key shown for the app. */
async function startSetup(page: Page, button: string): Promise<string> {
  await page.getByRole("button", { name: button }).click();
  await expect(page.getByRole("img", { name: "QR code for your authenticator app" })).toBeVisible();
  return page.getByLabel("Key for your authenticator app").inputValue();
}

/** Turns two-factor sign-in on from the security screen and returns the new key. */
async function turnOn(page: Page): Promise<string> {
  const newKey = await startSetup(page, "Turn on two-factor sign-in");
  await page.getByLabel("6-digit code from your app").fill(totp(newKey));
  await page.getByRole("button", { name: "Turn on", exact: true }).click();
  await expect(notice(page)).toHaveText(TWO_FACTOR_MESSAGES.turnedOn);
  return newKey;
}

/** What a session can read of Vividha's brands and of its own memberships, straight from the database. */
async function reads(db: Awaited<ReturnType<typeof dbAsAccount>>) {
  const [{ data: brands, error: brandError }, { data: clients }, { data: memberships }] = await Promise.all([
    db.from("brands").select("id").eq("client_id", IDS.vividha),
    db.from("clients").select("id"),
    db.from("memberships").select("role"),
  ]);
  expect(brandError).toBeNull();
  return { brands: brands?.length ?? 0, clients: clients?.length ?? 0, memberships: memberships?.length ?? 0 };
}

const auditCount = (action: string, userId: string) =>
  Number(sqlOnTestDatabase(`select count(*) from audit_log where action = '${action}' and entity_id = '${userId}'`));

// Accounts made for this file only. The admin, the second viewer and the recovery
// admin are members of Vividha; the operator has an account and no membership.
test.beforeAll(async () => {
  for (const [name, email, role] of [
    ["admin", ADMIN, "client_admin"],
    ["viewer", VIEWER, "client_viewer"],
    ["heldViewer", HELD_VIEWER, "client_viewer"],
    ["recover", RECOVER, "client_admin"],
    ["operator", OPERATOR, null],
  ] as const) {
    ids[name] = await createAccount(email, PASSWORD);
    if (role) {
      sqlOnTestDatabase(`insert into memberships (user_id, client_id, role) values ('${ids[name]}', '${IDS.vividha}', '${role}')`);
    }
  }
});

test("parts 1, 3 and 4: a client admin without two-factor is held on the setup screen and reads no data, then turns it on", async ({ page }) => {
  await signInAs(page, ADMIN);
  await expect(page).toHaveURL(HELD);
  await expect(alert(page)).toHaveText(TWO_FACTOR_MESSAGES.requiredNotSetUp);
  await expect(page.locator("p.lede")).toContainText("It is required for your role.");
  await expect(page.getByText("Two-factor sign-in is off.")).toBeVisible();
  await snap(page, "two-factor-00-held-on-setup");

  // Every other screen leads back here.
  for (const target of ["/clients", `/clients/${IDS.vividha}`, `/brands/${IDS.affilyvault}`]) {
    await page.goto(target);
    await expect(page).toHaveURL(HELD);
  }

  // The database is the barrier: the same person's password-only session reads its own membership and nothing else.
  expect(await reads(await dbAsAccount(ADMIN, PASSWORD))).toEqual({ brands: 0, clients: 0, memberships: 1 });

  key = await startSetup(page, "Turn on two-factor sign-in");
  expect(key).toMatch(/^[A-Z2-7]{16,}$/);
  await snap(page, "two-factor-01-setup");

  await page.getByLabel("6-digit code from your app").fill("000000");
  await page.getByRole("button", { name: "Turn on", exact: true }).click();
  // Shown under the "required" message, which stays until it is on.
  await expect(alert(page).filter({ hasText: TWO_FACTOR_MESSAGES.wrongCode })).toBeVisible();

  await page.getByLabel("6-digit code from your app").fill(await freshCode(key, used));
  await page.getByRole("button", { name: "Turn on", exact: true }).click();
  await expect(notice(page)).toHaveText(TWO_FACTOR_MESSAGES.turnedOn);
  await expect(authenticatorRows(page)).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Add another authenticator" })).toBeVisible();
  await snap(page, "two-factor-02-on");

  // Turning it on completed the second step: the client is visible now, and the change is audited (T05-9).
  await page.goto(`/clients/${IDS.vividha}`);
  await expect(page.getByRole("link", { name: /AffilyVault/ })).toBeVisible();
  expect(auditCount("two_factor_on", ids.admin)).toBe(1);
});

test("(a) a password-only session that opens a client page by its address sees no data and is sent to the code step", async ({ browser }) => {
  const page = await freshPage(browser);
  await signInAs(page, ADMIN);
  await expect(page).toHaveURL(/\/login\/two-factor$/);

  // The direct address, as a crafted request with this session's cookies: a redirect, and none of the client's data.
  const direct = await page.request.get(`/clients/${IDS.vividha}`, { maxRedirects: 0 });
  expect(direct.status()).toBe(307);
  expect(direct.headers()["location"]).toMatch(/\/login\/two-factor$/);
  expect(await direct.text()).not.toContain("AffilyVault");

  // In the browser: the code step, with nothing of the client on it.
  await page.goto(`/clients/${IDS.vividha}`);
  await expect(page).toHaveURL(/\/login\/two-factor$/);
  await expect(page.getByRole("heading", { name: "Enter your code" })).toBeVisible();
  await expect(page.getByText("AffilyVault")).toHaveCount(0);
  await expect(page.getByText("Vividha Marketing")).toHaveCount(0);
  await snap(page, "two-factor-03-code-step");

  // The same person's password-only session, straight to the database: no data (T05-5).
  expect(await reads(await dbAsAccount(ADMIN, PASSWORD))).toEqual({ brands: 0, clients: 0, memberships: 1 });
});

test("part 2: sign-in asks for the code; a wrong code is refused; the right code gives access", async ({ browser }) => {
  const page = await freshPage(browser);
  await signInAs(page, ADMIN);
  await enterCode(page, "000000");
  await expect(alert(page)).toHaveText(TWO_FACTOR_MESSAGES.wrongCode);
  await expect(page).toHaveURL(/\/login\/two-factor$/);

  await enterCode(page, await freshCode(key, used));
  await expect(page).toHaveURL(/\/clients$/);
  await page.getByRole("link", { name: /Vividha Marketing/ }).click();
  await expect(page.getByRole("link", { name: /AffilyVault/ })).toBeVisible();
  expect((await reads(await dbAsAccount(ADMIN, PASSWORD, key))).brands).toBeGreaterThan(0);
});

test("part 5: a required role cannot remove its last authenticator; with a second one it can", async ({ browser }) => {
  const page = await freshPage(browser);
  await signInAs(page, ADMIN);
  await enterCode(page, await freshCode(key, used));
  await expect(page).toHaveURL(/\/clients$/);

  await page.goto("/account/security");
  await authenticatorRows(page).first().getByRole("button", { name: "Remove" }).click();
  await expect(alert(page)).toHaveText(TWO_FACTOR_MESSAGES.lastOneRequired);
  await expect(authenticatorRows(page)).toHaveCount(1);
  await snap(page, "two-factor-04-last-one-kept");

  // A second authenticator, then the first can go.
  const secondKey = await startSetup(page, "Add another authenticator");
  expect(secondKey).not.toBe(key);
  await page.getByLabel("6-digit code from your app").fill(await freshCode(secondKey));
  await page.getByRole("button", { name: "Add authenticator" }).click();
  await expect(notice(page)).toHaveText(TWO_FACTOR_MESSAGES.added);
  await expect(authenticatorRows(page)).toHaveCount(2);

  await authenticatorRows(page).first().getByRole("button", { name: "Remove" }).click();
  await expect(notice(page)).toHaveText(TWO_FACTOR_MESSAGES.removed);
  await expect(authenticatorRows(page)).toHaveCount(1);
  await authenticatorRows(page).first().getByRole("button", { name: "Remove" }).click();
  await expect(alert(page)).toHaveText(TWO_FACTOR_MESSAGES.lastOneRequired);
  await expect(authenticatorRows(page)).toHaveCount(1);
  key = secondKey;
  used.length = 0;

  expect(auditCount("two_factor_added", ids.admin)).toBe(1);
  expect(auditCount("two_factor_removed", ids.admin)).toBe(1);

  // The code step accepts a code from whichever authenticator remains.
  const again = await freshPage(browser);
  await signInAs(again, ADMIN);
  await enterCode(again, await freshCode(key, used));
  await expect(again).toHaveURL(/\/clients$/);
});

test("part 5: a viewer, for whom it is optional, may remove their only authenticator", async ({ browser }) => {
  const page = await freshPage(browser);
  await signInAs(page, VIEWER);
  await expect(page).toHaveURL(/\/clients$/);
  await page.goto("/account/security");
  await expect(page.locator("p.lede")).toContainText("It is optional for your role.");
  await turnOn(page);

  await authenticatorRows(page).first().getByRole("button", { name: "Remove" }).click();
  await expect(notice(page)).toHaveText(TWO_FACTOR_MESSAGES.removed);
  await expect(page.getByText("Two-factor sign-in is off.")).toBeVisible();
});

test("part 7: a viewer who turns it on is asked for the code, and their password-only session reads no data", async ({ browser }) => {
  // Before: the password alone is enough, on screen and in the database (T05-6).
  expect((await reads(await dbAsAccount(HELD_VIEWER, PASSWORD))).brands).toBeGreaterThan(0);
  const page = await freshPage(browser);
  await signInAs(page, HELD_VIEWER);
  await expect(page).toHaveURL(/\/clients$/);
  await page.goto("/account/security");
  const viewerKey = await turnOn(page);

  // After: held to it (T05-10).
  const next = await freshPage(browser);
  await signInAs(next, HELD_VIEWER);
  await expect(next).toHaveURL(/\/login\/two-factor$/);
  expect(await reads(await dbAsAccount(HELD_VIEWER, PASSWORD))).toEqual({ brands: 0, clients: 0, memberships: 1 });
  await enterCode(next, totp(viewerKey));
  await expect(next).toHaveURL(/\/clients$/);
  expect((await reads(await dbAsAccount(HELD_VIEWER, PASSWORD, viewerKey))).brands).toBeGreaterThan(0);
});

test("part 6: the owner resets the admin's two-factor sign-in; it is audited and the admin must set it up again", async ({ browser }) => {
  // The admin is signed in, with the second step done, in another browser.
  const adminPage = await freshPage(browser);
  await signInAs(adminPage, ADMIN);
  await enterCode(adminPage, await freshCode(key, used));
  await expect(adminPage).toHaveURL(/\/clients$/);

  // A client admin sees no Reset button, and a crafted request is refused by the database.
  const clientAdminPage = await freshPage(browser);
  await signIn(clientAdminPage, "clientAdmin");
  await clientAdminPage.goto(`/clients/${IDS.vividha}/people`);
  await expect(clientAdminPage.getByRole("heading", { name: "People" })).toBeVisible();
  await expect(clientAdminPage.getByRole("button", { name: "Reset two-factor" })).toHaveCount(0);
  const { error: crafted } = await (await dbAs("clientAdmin")).rpc("reset_two_factor", { p_user: ids.admin });
  expect(crafted?.message).toBe("reset_not_allowed");
  expect(Number(sqlOnTestDatabase(`select count(*) from auth.mfa_factors where user_id = '${ids.admin}'`))).toBe(1);

  // The owner resets it.
  const page = await freshPage(browser);
  await signIn(page, "owner");
  await page.goto(`/clients/${IDS.vividha}/people`);
  const row = page.locator("section[aria-labelledby=members] ul.rows > li").filter({ hasText: ADMIN });
  await row.getByRole("button", { name: "Reset two-factor" }).click();
  await expect(notice(page)).toHaveText(resetDoneMessage(ADMIN));
  await snap(page, "two-factor-05-owner-reset");

  const audit = JSON.parse(
    sqlOnTestDatabase(`select after from audit_log where action = 'two_factor_reset' and entity_id = '${ids.admin}'`),
  );
  expect(audit.email).toBe(ADMIN);
  expect(audit.factors_removed).toBe(1);
  expect(audit.sessions_removed).toBeGreaterThan(0);
  expect(sqlOnTestDatabase(`select count(*) from auth.mfa_factors where user_id = '${ids.admin}'`)).toBe("0");
  expect(sqlOnTestDatabase(`select count(*) from auth.sessions where user_id = '${ids.admin}'`)).toBe("0");

  // The admin's open browser is signed out; signing in again holds them on the setup screen.
  await adminPage.goto(`/clients/${IDS.vividha}`);
  await expect(adminPage).toHaveURL(/\/login$/);
  await signInAs(adminPage, ADMIN);
  await expect(adminPage).toHaveURL(HELD);
  key = await turnOn(adminPage);
  await adminPage.goto(`/clients/${IDS.vividha}`);
  await expect(adminPage.getByRole("link", { name: /AffilyVault/ })).toBeVisible();
});

test("part 8: recovery with the repository's SQL file signs the person out everywhere; setup then works again", async ({ browser }) => {
  // The recovery admin turns two-factor on and keeps an aal2 session's tokens (as a second device would).
  const kept = await dbAsAccount(RECOVER, PASSWORD);
  const { data: enrolled } = await kept.auth.mfa.enroll({ factorType: "totp" });
  const recoverKey = enrolled!.totp.secret;
  const { error: verifyError } = await kept.auth.mfa.challengeAndVerify({ factorId: enrolled!.id, code: totp(recoverKey) });
  expect(verifyError).toBeNull();
  const { data: keptSession } = await kept.auth.getSession();
  const oldAccess = keptSession.session!.access_token;
  const oldRefresh = keptSession.session!.refresh_token;
  expect((await reads(kept)).brands).toBeGreaterThan(0);

  // And is signed in, with the code, in a browser.
  const oldPage = await freshPage(browser);
  await signInAs(oldPage, RECOVER);
  await enterCode(oldPage, totp(recoverKey));
  await expect(oldPage).toHaveURL(/\/clients$/);

  // The repository's file, with only the address and the reason filled in, on the local test database.
  const file = readFileSync(path.join(__dirname, "..", "supabase", "recovery", "remove_two_factor.sql"), "utf8");
  expect(file.match(/PUT-THE-EMAIL-HERE/g)).toHaveLength(1);
  expect(file.match(/PUT-THE-REASON-HERE/g)).toHaveLength(1);
  const reason = "identity confirmed by phone on 17 Oct";
  const output = sqlOnTestDatabase(file.replace("PUT-THE-EMAIL-HERE", RECOVER).replace("PUT-THE-REASON-HERE", reason));
  const counts = JSON.parse(output.split("\n").find((line) => line.startsWith(ids.recover))!.split("|")[1]);
  expect(counts.factors_removed).toBe(1);
  expect(counts.sessions_removed).toBeGreaterThanOrEqual(2);
  expect(counts.refresh_tokens_removed).toBeGreaterThanOrEqual(2);
  expect(auditCount("two_factor_reset_by_sql", ids.recover)).toBe(1);
  expect(counts.source).toBe("sql_editor");
  expect(counts.reason).toBe(reason);
  expect(
    sqlOnTestDatabase(
      `select actor_type || '|' || coalesce(actor_id::text, 'none') from audit_log where action = 'two_factor_reset_by_sql' and entity_id = '${ids.recover}'`,
    ),
  ).toBe("agent|none");

  // The old browser is sent to sign-in on its next page.
  await oldPage.goto(`/clients/${IDS.vividha}`);
  await expect(oldPage).toHaveURL(/\/login$/);

  // The old refresh token is refused.
  const { supabaseUrl, anonKey } = run();
  const other = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: refreshError } = await other.auth.refreshSession({ refresh_token: oldRefresh });
  expect(refreshError?.code).toBe("refresh_token_not_found");

  // The old access token, still unexpired, gets no client data from the database (D5). Its own
  // membership row stays readable by design (T05-11): that policy does not ask for a session.
  const stale = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${oldAccess}` } },
  });
  expect(await reads(stale)).toEqual({ brands: 0, clients: 0, memberships: 1 });

  // With the password alone: held on the setup screen, which can tell from their own membership that it is required.
  const page = await freshPage(browser);
  await signInAs(page, RECOVER);
  await expect(page).toHaveURL(HELD);
  await expect(page.locator("p.lede")).toContainText("It is required for your role.");
  await turnOn(page);
  await page.goto(`/clients/${IDS.vividha}`);
  await expect(page.getByRole("link", { name: /AffilyVault/ })).toBeVisible();
  await snap(page, "two-factor-06-recovered");
});

test("(b) an invited operator accepts, sets up an authenticator, and only then sees the client", async ({ browser }) => {
  const { error } = await (await dbAs("owner")).rpc("create_invitation", {
    p_client: IDS.vividha,
    p_email: OPERATOR,
    p_role: "operator",
  });
  expect(error).toBeNull();

  const page = await freshPage(browser);
  await signInAs(page, OPERATOR);
  await expect(page).toHaveURL(/\/invitations$/);
  await expect(page.locator("ul.rows > li")).toContainText("Vividha Marketing has invited you as an Operator.");
  await page.getByRole("button", { name: "Accept" }).click();

  // Now an operator, without two-factor: held on the setup screen, and the database gives nothing.
  await expect(page).toHaveURL(HELD);
  await expect(alert(page)).toHaveText(TWO_FACTOR_MESSAGES.requiredNotSetUp);
  await page.goto(`/clients/${IDS.vividha}`);
  await expect(page).toHaveURL(HELD);
  expect(await reads(await dbAsAccount(OPERATOR, PASSWORD))).toEqual({ brands: 0, clients: 0, memberships: 1 });
  await snap(page, "two-factor-07-new-operator-held");

  const operatorKey = await turnOn(page);
  await page.goto(`/clients/${IDS.vividha}`);
  await expect(page.getByRole("link", { name: /AffilyVault/ })).toBeVisible();
  expect((await reads(await dbAsAccount(OPERATOR, PASSWORD, operatorKey))).brands).toBeGreaterThan(0);
});
