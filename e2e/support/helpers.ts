import { expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readRun, type Run } from "../../scripts/e2e-lib.mjs";

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

/** Signs in through the sign-in screen and waits for the clients list. */
export async function signIn(page: Page, role: Role) {
  const user = run().users[role];
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
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
  const { supabaseUrl, anonKey, users } = run();
  const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword(users[role]);
  if (error) throw new Error(`Test sign-in failed for ${role}: ${error.message}`);
  return client;
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
