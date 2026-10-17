/**
 * Going live and email sign-up (S-01, S-08, batch 2): every refusal the
 * database raises, in words a person can act on, and the launch checklist's
 * labels. Database wording never reaches the screen.
 */

export interface ChecklistItem {
  key: string;
  passed: boolean;
  detail: string | null;
}

export const CHECKLIST_LABELS: Record<string, string> = {
  module: "Affiliate marketing switched on",
  details: "Business details complete",
  standard_pages: "Standard pages published",
  privacy_current: "Privacy Policy current (needed for email sign-up)",
  domain: "A verified domain",
};

/** Why an item fails, as the launch checklist shows it. */
export function checklistReason(item: ChecklistItem): string {
  switch (item.key) {
    case "module":
      return "Affiliate marketing is not switched on for this brand.";
    case "details":
      return `Business details are missing: ${item.detail ?? "some details"}. Fill them in on the Overview tab.`;
    case "standard_pages":
      return `Publish the standard pages first: ${item.detail ?? "all four"}.`;
    case "privacy_current":
      return "The Privacy Policy page uses older wording. Update it from the template, review it, and publish it.";
    case "domain":
      return item.detail
        ? `The last domain check failed for ${item.detail}. Fix the DNS records and press Check domain.`
        : "No verified domain yet. Add the DNS records below, then press Check domain.";
    default:
      return "This item is not ready yet.";
  }
}

const GENERIC = "That did not work. Try again, and if it keeps happening, tell the owner.";

/** Every refusal code raised by 0010 to 0012 for the people running a site. */
export const LAUNCH_REFUSALS: Record<string, string> = {
  site_not_allowed: "Only the owner and operators can set up a site or take it live.",
  site_module_off: "Affiliate marketing is not switched on for this brand.",
  site_details_missing: "Fill in the business details on the Overview tab first: operator name, address, and contact email.",
  site_not_set_up: "Set up the site first.",
  site_not_ready: "Not live yet. Every item on the launch checklist must pass first.",
  site_already_live: "The site is already live.",
  site_offline_not_allowed: "Only the owner, operators, and this client's admins can take a site offline.",
  site_not_live: "The site is not live.",
  signup_not_allowed: "Only the owner and operators can switch email sign-up on or off.",
  signup_site_not_live: "Email sign-up can be switched on only for a live site.",
  signup_privacy_outdated:
    "Publish the current Privacy Policy first: Update from template, review it, and publish it. It must keep the paragraph on email sign-up.",
  signup_no_contact_email: "Add a contact email under Business details first. The Privacy Policy tells subscribers to write to it.",
  page_site_live: "A standard page cannot be unpublished while the site is live. Take the site offline first.",
  page_update_not_allowed: "Only the owner and operators can update a page from the template.",
  page_not_from_template: "This page was not made from a template.",
  page_details_missing: "Fill in the business details on the Overview tab first: operator name, address, and contact email.",
  page_template_version_locked: "The template version of a page can change only through Update from template.",
  page_unresolved_placeholder:
    "Not published. The page still has a placeholder in double braces, such as {{email}}. Replace it with the real text first.",
  domain_taken: "That domain is already used by another brand.",
  domain_not_found: "That domain is no longer on this brand. Reload the page.",
  domain_bad_reason: GENERIC,
};

export function launchRefusalMessage(databaseMessage: string | undefined): string {
  return LAUNCH_REFUSALS[(databaseMessage ?? "").trim()] ?? GENERIC;
}

/** Every refusal a visitor can meet on the sign-up form. */
export const SIGNUP_MESSAGES = {
  done: "Thank you. You're on the list.",
  signup_no_consent: "Tick the box to agree to receive emails, or leave the form.",
  signup_bad_email: "Enter a valid email address, for example name@example.com.",
  signup_rate_limited: "Please try again in a minute.",
  signup_unavailable: "Sign-up is not available right now.",
  signup_wording_changed: "The wording of this form has just changed. Please read it again, then sign up.",
} as const;

export type SignupOutcome = keyof typeof SIGNUP_MESSAGES;

export function signupOutcome(databaseMessage: string | undefined): SignupOutcome {
  const code = (databaseMessage ?? "").trim();
  return code in SIGNUP_MESSAGES && code !== "done" ? (code as SignupOutcome) : "signup_unavailable";
}

export const SITE_STATUS_TEXT = {
  none: "No site yet.",
  draft: "Draft: not visible to the public.",
  live: (since: string, hosts: string) => `Live since ${since}${hosts ? ` at ${hosts}` : ""}.`,
  offline: (since: string) => `Offline since ${since}: not visible to the public.`,
};
