import { expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DB_CONTAINER, docker, readRun, type Run } from "../../scripts/e2e-lib.mjs";
import { totp } from "./totp";

/** Fixed ids from migrations 0002 and 0005 and from e2e/seed.sql. */
export const IDS = {
  vividha: "11111111-1111-4111-8111-111111111111",
  affilyvault: "22222222-2222-4222-8222-222222222222",
  famperia: "33333333-3333-4333-8333-333333333333",
  separationClient: "44444444-4444-4444-8444-444444444444",
  petSleepOffer: "55555555-5555-4555-8555-555555555555",
} as const;

export type Role = keyof Run["users"];

let cached: Run | undefined;
/** This run's settings. Stops unless they point at the local test stack. */
export function run(): Run {
  cached ??= readRun();
  return cached;
}

/**
 * Signs in through the sign-in screen, with the code from the person's
 * authenticator when two-factor sign-in is on for them (T-05), and waits for
 * the clients list.
 */
export async function signIn(page: Page, role: Role) {
  const user = run().users[role];
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  if (user.totpKey) {
    await expect(page).toHaveURL(/\/login\/two-factor$/);
    await page.getByLabel("6-digit code").fill(totp(user.totpKey));
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await expect(page).toHaveURL(/\/clients$/);
}

/** Saves a full-page screenshot of a key step to test-results/e2e/screens. */
export async function snap(page: Page, name: string) {
  await page.screenshot({ path: `test-results/e2e/screens/${name}.png`, fullPage: true });
}

// By class as well as role: Next.js adds its own empty role="alert" (the route announcer).
/** The confirmation a screen shows after a save. */
export const notice = (page: Page) => page.locator('p.notice[role="status"]');
/** The refusal a screen shows. */
export const alert = (page: Page) => page.locator('p.error[role="alert"]');

/** The brand's tabs. Check with: await expect(tabs(page)).toHaveText([...]) */
export const tabs = (page: Page) => page.getByRole("navigation", { name: "Brand sections" }).getByRole("link");

/** The On/Off badge of a module on the brand's Overview. */
export const moduleBadge = (page: Page, module: "Affiliate marketing" | "Dropshipping") =>
  page
    .locator("ul.rows > li")
    .filter({ has: page.locator("strong", { hasText: new RegExp(`^${module}$`) }) })
    .locator(".status");

export const AFFILIATE_TABS = ["Overview", "Offers", "Site and links", "Results"];

/**
 * A database session as a test user, through the local API with the anon key,
 * exactly as the application's own requests are made. Used for checks no
 * screen shows (the audit log) and for requests that skip the screens.
 */
export async function dbAs(role: Role): Promise<SupabaseClient> {
  const { email, password, totpKey } = run().users[role];
  return dbAsAccount(email, password, totpKey);
}

/**
 * Stops every request that leaves the test machine, and records it. The click
 * redirect sends the browser to the seller; this keeps that inside the browser.
 * Set on the whole browser context, so tabs the page opens are covered too.
 */
export async function stopOutsideRequests(page: Page): Promise<string[]> {
  const stopped: string[] = [];
  await page.context().route(
    (url) => !["localhost", "127.0.0.1"].includes(url.hostname),
    async (route) => {
      stopped.push(route.request().url());
      await route.fulfill({ status: 200, contentType: "text/plain", body: "Stopped by the test: outside site." });
    },
  );
  return stopped;
}

/**
 * Creates a confirmed account on the local stack, through its admin API with
 * the local stack's own service role key (passed in by e2e.mjs, never written).
 */
export async function createAccount(email: string, password: string): Promise<string> {
  const { supabaseUrl } = run();
  const key = process.env.E2E_SERVICE_KEY;
  if (!key) throw new Error("E2E_SERVICE_KEY is not set: run the tests with npm run test:e2e.");
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!response.ok) throw new Error(`Test account ${email} was not created: ${response.status}`);
  return ((await response.json()) as { id: string }).id;
}

/**
 * A Supabase session for any account, by email and password, through the local
 * API. With an authenticator key it also does the second step (aal2); without
 * one it is a password-only session (aal1).
 */
export async function dbAsAccount(email: string, password: string, totpKey?: string): Promise<SupabaseClient> {
  const { supabaseUrl, anonKey } = run();
  const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Test sign-in failed for ${email}: ${error.message}`);
  if (totpKey) {
    const { data: factors } = await client.auth.mfa.listFactors();
    const factor = factors?.totp.find((candidate) => candidate.status === "verified");
    if (!factor) throw new Error(`${email} has no verified authenticator.`);
    const { error: codeError } = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(totpKey) });
    if (codeError) throw new Error(`Test second step failed for ${email}: ${codeError.message}`);
  }
  return client;
}

/**
 * Runs SQL as the database superuser of this project's local test stack only
 * (container supabase_db_affiqube-e2e), for changes no screen can make, such as
 * moving an invitation's expiry into the past.
 */
export function sqlOnTestDatabase(sql: string): string {
  if (DB_CONTAINER !== "supabase_db_affiqube-e2e") throw new Error(`STOP: ${DB_CONTAINER} is not the test database.`);
  const result = docker(["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

/**
 * The fields a form posts, read from the server-rendered page as this signed-in
 * page would receive it: hidden fields, including the server action's id (which
 * the browser drops once the page is interactive), and checked choices. Picks
 * the form containing every given text.
 */
export async function serverFormFields(page: Page, path: string, ...containing: string[]): Promise<Record<string, string>> {
  const html = await (await page.request.get(path)).text();
  const form = [...html.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => containing.every((text) => f.includes(text)));
  if (!form) throw new Error(`No form on ${path} containing ${containing.join(", ")}.`);
  const unescape = (value: string) => value.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const fields: Record<string, string> = {};
  for (const [tag] of form.matchAll(/<input\b[^>]*>/g)) {
    const attribute = (name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
    const name = attribute("name");
    const type = attribute("type");
    if (!name || ((type === "radio" || type === "checkbox") && !/\schecked(=|\s|\/|>)/.test(tag))) continue;
    fields[unescape(name)] = unescape(attribute("value") ?? "");
  }
  return fields;
}

/**
 * Posts a form's fields directly, without the browser, as a crafted request
 * would, with the signed-in cookies of this page. Redirects are not followed,
 * so the response can be inspected exactly.
 */
export async function postForm(page: Page, path: string, fields: Record<string, string>) {
  return page.request.post(path, {
    multipart: fields,
    maxRedirects: 0,
    headers: { Origin: "http://localhost:3100" },
  });
}
