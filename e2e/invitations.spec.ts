// Increment 6, step 3 (T-03): invitations from the People screen, the email
// link with its Continue button, choosing a password, accepting and declining,
// Send again, the sign-in link, and every refusal a person can meet. Emails go
// only to the local mail catcher; nothing leaves the machine.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { signInLinkMessage } from "../src/core/invitations";
import {
  alert,
  createAccount,
  dbAsAccount,
  serverFormFields,
  IDS,
  notice,
  postForm,
  run,
  signIn,
  snap,
  sqlOnTestDatabase,
} from "./support/helpers";
import { confirmLink, mailCount, nextMail } from "./support/mail";

const stamp = Date.now().toString(36);
const PEOPLE = `/clients/${IDS.vividha}/people`;
const PASSWORD = `Test-password-${stamp}-ok`;

const inviteForm = (page: Page) => page.locator("form").filter({ has: page.getByRole("button", { name: "Send invitation" }) });
const invitationRow = (page: Page, email: string) =>
  page.locator("section[aria-labelledby=invitations] ul.rows > li").filter({ hasText: email });

async function invite(page: Page, email: string, role: "Operator" | "Client admin" | "Viewer") {
  await page.goto(PEOPLE);
  await inviteForm(page).getByLabel("Email").fill(email);
  await inviteForm(page).getByRole("radio", { name: role }).check();
  await inviteForm(page).getByRole("button", { name: "Send invitation" }).click();
}

/** A signed-out browser, as the invited person's own. */
async function freshPage(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

/** Opens an email link and presses Continue. */
async function followLink(page: Page, link: string) {
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Continue to Affiqube" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
}

const errorFromLocation = (location: string | undefined) =>
  new URL(location ?? "", "http://localhost:3100").searchParams.get("error");

test("the owner invites a new person as a viewer; a scanner opening the link uses nothing; Continue, password, accept", async ({
  page,
  browser,
  playwright,
}) => {
  const email = `inv-new-${stamp}@example.com`;
  await signIn(page, "owner");
  await page.goto(`/clients/${IDS.vividha}`);
  await page.getByRole("link", { name: "People" }).click();
  await expect(page).toHaveURL(PEOPLE);
  await invite(page, email, "Viewer");
  await expect(notice(page)).toHaveText(new RegExp(`^Invitation sent to ${email}\\. It expires on [A-Z][a-z]+ \\d{1,2}, \\d{4}\\.$`));
  await expect(invitationRow(page, email)).toContainText("Viewer, sent by you, expires on");
  await snap(page, "invitations-01-sent");

  const mail = await nextMail(email);
  expect(mail.Subject).toBe("You're invited to Affiqube");
  const link = confirmLink(mail);

  // (a) An email scanner opens the link: a page is shown, no session cookie is set, and the link is not used.
  const scanner = await playwright.request.newContext();
  const scanned = await scanner.get(link);
  expect(scanned.status()).toBe(200);
  expect(await scanned.text()).toContain("Continue to Affiqube");
  expect(scanned.headers()["set-cookie"] ?? "").not.toMatch(/sb-/);
  await scanner.dispose();

  // The person, in their own signed-out browser, presses Continue: the link still works.
  const person = await freshPage(browser);
  await followLink(person, link);
  await expect(person).toHaveURL(/\/account\/password$/);
  await snap(person, "invitations-02-choose-password");

  await person.getByLabel("Password", { exact: true }).fill("too-short");
  await person.getByLabel("Confirm password").fill("too-short");
  await person.locator("form").filter({ has: person.getByRole("button", { name: "Save password" }) }).evaluate((form) => form.setAttribute("novalidate", ""));
  await person.getByRole("button", { name: "Save password" }).click();
  await expect(alert(person)).toHaveText("Passwords must be at least 12 characters.");

  await person.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await person.getByLabel("Confirm password").fill(PASSWORD);
  await person.getByRole("button", { name: "Save password" }).click();
  await expect(person).toHaveURL(/\/invitations/);
  await expect(notice(person)).toHaveText("Password saved.");
  await expect(person.locator("ul.rows > li")).toContainText("Vividha Marketing has invited you as a Viewer.");
  await expect(person.locator("ul.rows > li")).toContainText("Viewers can see results but cannot change anything.");
  await snap(person, "invitations-03-open-invitation");

  await person.getByRole("button", { name: "Accept" }).click();
  await expect(person).toHaveURL(new RegExp(`/clients/${IDS.vividha}`));
  await expect(notice(person)).toHaveText("You now have access to Vividha Marketing as Viewer.");
  await expect(person.getByRole("link", { name: /AffilyVault/ })).toBeVisible();
  await expect(person.getByRole("link", { name: "People" })).toHaveCount(0);
  await snap(person, "invitations-04-accepted");

  // Exactly one membership: the client and role the invitation named.
  const db = await dbAsAccount(email, PASSWORD);
  const { data: memberships } = await db.from("memberships").select("client_id, role");
  expect(memberships).toEqual([{ client_id: IDS.vividha, role: "client_viewer" }]);

  // The same link a second time is refused.
  const again = await freshPage(browser);
  await followLink(again, link);
  await expect(alert(again)).toHaveText("This link has expired or was already used. Ask for the invitation to be sent again.");
  await expect(again.getByRole("button", { name: "Continue" })).toHaveCount(0);
  await snap(again, "invitations-05-link-used-twice");
});

test("a client admin can invite client admins and viewers only; a crafted operator request is refused", async ({ page }) => {
  await signIn(page, "clientAdmin");
  await page.goto(PEOPLE);
  await expect(inviteForm(page).getByRole("radio")).toHaveCount(2);
  await expect(inviteForm(page).getByRole("radio", { name: "Client admin" })).toBeVisible();
  await expect(inviteForm(page).getByRole("radio", { name: "Viewer" })).toBeVisible();
  await expect(inviteForm(page).getByRole("radio", { name: "Operator" })).toHaveCount(0);
  await snap(page, "invitations-06-admin-roles");

  // Crafted: the same form, posted with role=operator.
  const operator = `inv-op-${stamp}@example.com`;
  const fields = { ...(await serverFormFields(page, PEOPLE, "Send invitation")), email: operator, role: "operator" };
  const response = await postForm(page, PEOPLE, fields);
  expect(response.status()).toBe(303);
  expect(errorFromLocation(response.headers()["location"])).toBe(
    "Client admins can invite other client admins and viewers. Only the owner can invite operators.",
  );
  expect(sqlOnTestDatabase(`select count(*) from invitations where email = '${operator}'`)).toBe("0");
  expect(await mailCount(operator)).toBe(0);

  const admin = `inv-admin-${stamp}@example.com`;
  await invite(page, admin, "Client admin");
  await expect(notice(page)).toHaveText(new RegExp(`^Invitation sent to ${admin}\\.`));
  await expect(invitationRow(page, admin)).toContainText("Client admin, sent by you");
});

test("(b) the response is the same for a new address and an existing account; the existing person declines", async ({
  page,
  browser,
}) => {
  // Same length, so even the content length cannot differ.
  const fresh = `inv-bnew-${stamp}@example.com`;
  const existing = `inv-bold-${stamp}@example.com`;
  await createAccount(existing, PASSWORD);

  await signIn(page, "owner");
  const fields = await serverFormFields(page, PEOPLE, "Send invitation");
  const responseFor = async (email: string) => {
    const response = await postForm(page, PEOPLE, { ...fields, email, role: "client_viewer" });
    const normalise = (text: string) => text.split(email).join("EMAIL").split(encodeURIComponent(email)).join("EMAIL");
    const headers = Object.entries(response.headers())
      .filter(([name]) => name !== "date")
      .map(([name, value]) => `${name}: ${normalise(value)}`)
      .sort();
    return { status: response.status(), headers, body: normalise(await response.text()) };
  };
  const forNew = await responseFor(fresh);
  const forExisting = await responseFor(existing);
  expect(forNew.status).toBe(303);
  expect(forExisting).toEqual(forNew);

  // Behind the identical responses, Supabase sent different emails (D1).
  expect((await nextMail(fresh)).Subject).toBe("You're invited to Affiqube");
  const signInMail = await nextMail(existing);
  expect(signInMail.Subject).toBe("Your Affiqube sign-in link");

  // The existing person signs in with the link and finds the invitation waiting, then declines it.
  const person = await freshPage(browser);
  await followLink(person, confirmLink(signInMail));
  await expect(person).toHaveURL(/\/invitations$/);
  await expect(person.locator("ul.rows > li")).toContainText("Vividha Marketing has invited you as a Viewer.");
  await person.getByRole("button", { name: "Decline" }).click();
  await expect(notice(person)).toHaveText("Invitation declined.");
  await expect(person.getByText("You have no open invitations.")).toBeVisible();

  await page.goto(PEOPLE);
  await expect(page.getByRole("list", { name: "Recent invitations" }).locator("li").filter({ hasText: existing })).toContainText(
    "Declined",
  );
  await snap(page, "invitations-07-declined");

  // A declined invitation cannot be accepted afterwards, even by a direct request.
  const id = sqlOnTestDatabase(`select id from invitations where email = '${existing}'`);
  const { error } = await (await dbAsAccount(existing, PASSWORD)).rpc("accept_invitation", { p_id: id });
  expect(error?.message).toBe("invite_declined");
});

test("Send again sends a second email; a viewer's crafted Send again is refused and sends nothing", async ({ page, browser }) => {
  const email = `inv-again-${stamp}@example.com`;
  await signIn(page, "clientAdmin");
  await invite(page, email, "Viewer");
  await expect(notice(page)).toHaveText(new RegExp(`^Invitation sent to ${email}\\.`));
  await nextMail(email);
  expect(await mailCount(email)).toBe(1);

  const sendAgain = invitationRow(page, email).locator("form").filter({ has: page.getByRole("button", { name: "Send again" }) });
  const id = sqlOnTestDatabase(`select id from invitations where email = '${email}'`);
  const fields = await serverFormFields(page, PEOPLE, "Send again", id);
  await sendAgain.getByRole("button", { name: "Send again" }).click();
  await expect(notice(page)).toHaveText(`Invitation sent again to ${email}.`);
  await nextMail(email, 1);
  expect(await mailCount(email)).toBe(2);

  // A viewer replays the admin's Send again request.
  const viewer = await freshPage(browser);
  await signIn(viewer, "clientViewer");
  const response = await postForm(viewer, PEOPLE, fields);
  expect(response.status()).toBe(303);
  expect(errorFromLocation(response.headers()["location"])).toBe("You can no longer send this invitation. Ask the owner.");
  await viewer.waitForTimeout(2_000);
  expect(await mailCount(email)).toBe(2);
  expect(sqlOnTestDatabase(`select send_count from invitations where email = '${email}'`)).toBe("2");

  // The viewer has no People screen and no link to it.
  const people = await viewer.goto(PEOPLE);
  expect(people?.status()).toBe(404);
  await viewer.goto(`/clients/${IDS.vividha}`);
  await expect(viewer.getByRole("link", { name: "People" })).toHaveCount(0);
});

test("Email me a sign-in link: one message whatever the address; a link only for a real account; no account created", async ({
  page,
  browser,
}) => {
  const known = `inv-link-${stamp}@example.com`;
  const unknown = `inv-nobody-${stamp}@example.com`;
  await createAccount(known, PASSWORD);

  const ask = async (email: string) => {
    await page.goto("/login");
    await page.getByText("Email me a sign-in link").click();
    await page.getByLabel("Email for the link").fill(email);
    await page.getByRole("button", { name: "Send link" }).click();
    await expect(notice(page)).toHaveText(signInLinkMessage(email));
  };

  await ask(known);
  await snap(page, "invitations-08-sign-in-link-asked");
  const mail = await nextMail(known);
  expect(mail.Subject).toBe("Your Affiqube sign-in link");
  const person = await freshPage(browser);
  await followLink(person, confirmLink(mail));
  await expect(person).toHaveURL(/\/clients$/);

  await ask(unknown);
  await page.waitForTimeout(2_000);
  expect(await mailCount(unknown)).toBe(0);
  expect(sqlOnTestDatabase(`select count(*) from auth.users where email = '${unknown}'`)).toBe("0");
});

test("expired, withdrawn, and another account's invitations are refused with their messages", async ({ page, browser }) => {
  const expired = `inv-exp-${stamp}@example.com`;
  const withdrawn = `inv-wd-${stamp}@example.com`;
  await createAccount(expired, PASSWORD);
  await createAccount(withdrawn, PASSWORD);

  await signIn(page, "owner");
  await invite(page, expired, "Viewer");
  await invite(page, withdrawn, "Viewer");

  // Both people sign in and see their invitation.
  const expiredPerson = await freshPage(browser);
  await expiredPerson.goto("/login");
  await expiredPerson.getByLabel("Email", { exact: true }).fill(expired);
  await expiredPerson.getByLabel("Password").fill(PASSWORD);
  await expiredPerson.getByRole("button", { name: "Sign in" }).click();
  await expect(expiredPerson).toHaveURL(/\/invitations$/);

  const withdrawnPerson = await freshPage(browser);
  await withdrawnPerson.goto("/login");
  await withdrawnPerson.getByLabel("Email", { exact: true }).fill(withdrawn);
  await withdrawnPerson.getByLabel("Password").fill(PASSWORD);
  await withdrawnPerson.getByRole("button", { name: "Sign in" }).click();
  await expect(withdrawnPerson).toHaveURL(/\/invitations$/);

  // Expired while the page was open.
  sqlOnTestDatabase(
    `update invitations set created_at = now() - interval '8 days', expires_at = now() - interval '1 minute' where email = '${expired}'`,
  );
  await expiredPerson.getByRole("button", { name: "Accept" }).click();
  await expect(alert(expiredPerson)).toHaveText("This invitation has expired. Ask the person who invited you to send a new one.");

  // Withdrawn by the owner while the page was open.
  await page.goto(PEOPLE);
  await invitationRow(page, withdrawn).getByRole("button", { name: "Withdraw" }).click();
  await expect(notice(page)).toHaveText(`Invitation to ${withdrawn} withdrawn.`);
  await withdrawnPerson.getByRole("button", { name: "Accept" }).click();
  await expect(alert(withdrawnPerson)).toHaveText("This invitation was withdrawn by the person who sent it.");
  await snap(withdrawnPerson, "invitations-09-withdrawn");

  // Another account cannot accept someone else's invitation, even directly.
  const other = `inv-other-${stamp}@example.com`;
  await invite(page, other, "Viewer");
  const id = sqlOnTestDatabase(`select id from invitations where email = '${other}'`);
  const { error } = await (await dbAsAccount(expired, PASSWORD)).rpc("accept_invitation", { p_id: id });
  expect(error?.message).toBe("invite_not_for_you");

  expect(sqlOnTestDatabase(`select count(*) from memberships m join auth.users u on u.id = m.user_id where u.email in ('${expired}', '${withdrawn}')`)).toBe("0");
});

test("the second client's admin cannot see Vividha's people or invite into Vividha", async ({ page, browser }) => {
  await signIn(page, "owner");
  const fields = await serverFormFields(page, PEOPLE, "Send invitation");

  const other = await freshPage(browser);
  await signIn(other, "otherAdmin");
  const people = await other.goto(PEOPLE);
  expect(people?.status()).toBe(404);

  const email = `inv-cross-${stamp}@example.com`;
  const response = await postForm(other, PEOPLE, { ...fields, email, role: "client_viewer" });
  expect(response.status()).toBe(303);
  expect(errorFromLocation(response.headers()["location"])).toBe("You can invite people only to your own client.");
  expect(sqlOnTestDatabase(`select count(*) from invitations where email = '${email}'`)).toBe("0");
});

test("public sign-up is refused", async () => {
  const { supabaseUrl, anonKey } = run();
  const response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: `inv-signup-${stamp}@example.com`, password: PASSWORD }),
  });
  expect(response.status).toBe(422);
  expect(((await response.json()) as { error_code?: string }).error_code).toBe("signup_disabled");
});
