import { expect } from "@playwright/test";
import { MAIL_URL } from "../../scripts/e2e-lib.mjs";

/**
 * The local mail catcher (Mailpit on 127.0.0.1:54424). The local Supabase sends
 * every email here; nothing leaves the machine. The guard refuses any
 * configuration with a real mail server.
 */
if (!/^http:\/\/127\.0\.0\.1:5442[1-7]$/.test(MAIL_URL)) throw new Error(`STOP: ${MAIL_URL} is not the local mail catcher.`);

interface Summary {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

export interface Mail {
  ID: string;
  Subject: string;
  HTML: string;
  Text: string;
}

async function summariesFor(to: string): Promise<Summary[]> {
  const response = await fetch(`${MAIL_URL}/api/v1/messages?limit=500`);
  const body = (await response.json()) as { messages?: Summary[] };
  return (body.messages ?? []).filter((message) => message.To.some((t) => t.Address.toLowerCase() === to.toLowerCase()));
}

/** How many emails this address has received so far. */
export async function mailCount(to: string): Promise<number> {
  return (await summariesFor(to)).length;
}

/** Waits until this address has more than `seen` emails, and returns the newest. */
export async function nextMail(to: string, seen = 0): Promise<Mail> {
  let summaries: Summary[] = [];
  await expect
    .poll(async () => (summaries = await summariesFor(to)).length, { message: `an email to ${to}`, timeout: 15_000 })
    .toBeGreaterThan(seen);
  const response = await fetch(`${MAIL_URL}/api/v1/message/${summaries[0].ID}`);
  return (await response.json()) as Mail;
}

/** The /auth/confirm link in an email. It must go to the application under test. */
export function confirmLink(mail: Mail): string {
  const href = mail.HTML.match(/href="([^"]*\/auth\/confirm\?[^"]*)"/)?.[1];
  if (!href) throw new Error(`No /auth/confirm link in "${mail.Subject}".`);
  const link = href.replace(/&amp;/g, "&");
  expect(new URL(link).origin, "email links go to the application under test").toBe("http://localhost:3100");
  return link;
}
