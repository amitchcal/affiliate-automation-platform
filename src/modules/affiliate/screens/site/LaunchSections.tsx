import type { SupabaseClient } from "@supabase/supabase-js";
import { addDomain, checkDomainNow, removeDomain } from "@/core/domains/actions";
import { CHECK_MESSAGES, dnsTargets, type CheckReason } from "@/core/domains/dns-check";
import { DomainWarnings } from "@/core/domains/DomainWarnings";
import { CHECKLIST_LABELS, checklistReason, SITE_STATUS_TEXT, type ChecklistItem } from "@/modules/affiliate/site/launch";
import { deleteSubscriber, goLive, setSignup, setUpSite, takeOffline } from "./launch-actions";

interface SiteRow {
  status: "draft" | "live" | "offline";
  signup_enabled: boolean;
  went_live_at: string | null;
  status_changed_at: string;
}

interface HostRow {
  id: string;
  host: string;
  purpose: "site" | "links";
  status: "pending" | "verified";
  verification_code: string;
  checked_at: string | null;
  check_ok: boolean | null;
  check_reason: CheckReason | null;
  failed_since: string | null;
  verified_at: string | null;
}

interface SubscriberRow {
  id: string;
  email: string;
  consented_at: string;
  source_page: string | null;
  status: string;
}

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { dateStyle: "long" }) : "");

/** Who may do what here; the database decides again on every action. */
export async function rolesFor(supabase: SupabaseClient, clientId: string) {
  const { data: own } = await supabase.from("memberships").select("role, client_id");
  const rows = own ?? [];
  const owner = rows.some((row) => row.role === "owner");
  const role = rows.find((row) => row.client_id === clientId)?.role as string | undefined;
  const canManage = owner || role === "operator";
  return { canManage, canApprove: canManage || role === "client_admin" };
}

/**
 * The top of the Site and links tab (S-01, S-08): going live with its
 * checklist, the brand's domains, and email sign-up.
 */
export async function LaunchSections({
  supabase,
  brand,
}: {
  supabase: SupabaseClient;
  brand: { id: string; client_id: string; domain: string };
}) {
  const returnTo = `/brands/${brand.id}/site`;
  const [{ canManage, canApprove }, { data: site }, { data: checklist }, { data: hostRows }, { data: count }] = await Promise.all([
    rolesFor(supabase, brand.client_id),
    supabase.from("aff_sites").select("status, signup_enabled, went_live_at, status_changed_at").eq("brand_id", brand.id).maybeSingle(),
    supabase.rpc("site_launch_checklist", { p_brand: brand.id }),
    supabase
      .from("brand_domains")
      .select("id, host, purpose, status, verification_code, checked_at, check_ok, check_reason, failed_since, verified_at")
      .eq("brand_id", brand.id)
      .order("created_at"),
    supabase.rpc("subscriber_count", { p_brand: brand.id }),
  ]);
  const siteRow = site as SiteRow | null;
  const items = ((checklist ?? []) as ChecklistItem[]).filter((item) => item.key !== "privacy_current" || siteRow?.signup_enabled);
  const allPass = items.length > 0 && items.every((item) => item.passed);
  const hosts = (hostRows ?? []) as HostRow[];
  const liveHosts = hosts.filter((host) => host.status === "verified" && host.purpose === "site").map((host) => host.host);
  const targets = dnsTargets();
  const { data: subscriberRows } =
    canApprove && siteRow
      ? await supabase
          .from("subscribers")
          .select("id, email, consented_at, source_page, status")
          .eq("brand_id", brand.id)
          .order("consented_at", { ascending: false })
          .limit(200)
      : { data: [] };
  const subscribers = (subscriberRows ?? []) as SubscriberRow[];

  const statusText = !siteRow
    ? SITE_STATUS_TEXT.none
    : siteRow.status === "live"
      ? SITE_STATUS_TEXT.live(date(siteRow.went_live_at), liveHosts.join(", "))
      : siteRow.status === "offline"
        ? SITE_STATUS_TEXT.offline(date(siteRow.status_changed_at))
        : SITE_STATUS_TEXT.draft;

  return (
    <>
      <DomainWarnings supabase={supabase} brandId={brand.id} />

      <section className="stack" aria-labelledby="launch">
        <div>
          <h2 id="launch">Going live</h2>
          <p className="lede" data-site-status={siteRow?.status ?? "none"}>
            {statusText}
          </p>
        </div>
        {!siteRow ? (
          canManage ? (
            <form action={setUpSite} className="panel">
              <input type="hidden" name="brand_id" value={brand.id} />
              <p>Creates the site from the standard template, with its four standard pages as drafts.</p>
              <div className="actions">
                <button type="submit">Set up site</button>
              </div>
            </form>
          ) : (
            <p className="panel empty">The owner or an operator sets up the site.</p>
          )
        ) : (
          <>
            <ul className="rows" aria-label="Launch checklist">
              {items.map((item) => (
                <li key={item.key} data-check={item.key} data-passed={item.passed ? "yes" : "no"}>
                  <div className="split">
                    <span>
                      <strong>{item.passed ? "✓" : "✗"}</strong> {CHECKLIST_LABELS[item.key] ?? item.key}
                    </span>
                    {item.passed ? <span className="status published">Ready</span> : <span className="hint">{checklistReason(item)}</span>}
                  </div>
                </li>
              ))}
            </ul>
            <div className="actions">
              {canManage && siteRow.status !== "live" ? (
                <form action={goLive}>
                  <input type="hidden" name="brand_id" value={brand.id} />
                  <button type="submit" disabled={!allPass}>
                    Go live
                  </button>
                </form>
              ) : null}
              {canApprove && siteRow.status === "live" ? (
                <form action={takeOffline}>
                  <input type="hidden" name="brand_id" value={brand.id} />
                  <button type="submit" className="quiet">
                    Take offline
                  </button>
                </form>
              ) : null}
            </div>
          </>
        )}
      </section>

      <section className="stack" aria-labelledby="domains">
        <div>
          <h2 id="domains">Domains</h2>
          <p className="lede">
            A Site domain shows the brand's pages once the site is live. A Links only domain carries tracked links and
            nothing else, for example while the pages are still elsewhere.
          </p>
        </div>
        {hosts.length === 0 ? <p className="panel empty">No domains yet.</p> : null}
        <ul className="rows" aria-label="Domains">
          {hosts.map((host) => (
            <li key={host.id} data-host={host.host}>
              <div className="split">
                <div>
                  <strong>{host.host}</strong>
                  <div className="hint">
                    {host.purpose === "site" ? "Site" : "Links only"},{" "}
                    {host.status === "verified" ? `verified on ${date(host.verified_at)}` : "waiting for a domain check"}
                    {host.check_ok === false && host.check_reason ? `. Last check: ${CHECK_MESSAGES[host.check_reason](host.host)}` : ""}
                  </div>
                </div>
                {canManage ? (
                  <div className="actions">
                    <form action={checkDomainNow}>
                      <input type="hidden" name="return_to" value={returnTo} />
                      <input type="hidden" name="domain_id" value={host.id} />
                      <button type="submit" className="quiet">
                        Check domain
                      </button>
                    </form>
                    <form action={removeDomain}>
                      <input type="hidden" name="return_to" value={returnTo} />
                      <input type="hidden" name="domain_id" value={host.id} />
                      <button type="submit" className="quiet">
                        Remove
                      </button>
                    </form>
                  </div>
                ) : null}
              </div>
              {canManage && (host.status !== "verified" || host.failed_since) ? (
                <div className="panel" aria-label={`DNS records for ${host.host}`}>
                  <p>Add these records where the domain's DNS is managed, then press Check domain:</p>
                  <ul>
                    <li className="mono">
                      Type TXT, name _affiqube.{host.host}, value {host.verification_code}
                    </li>
                    {targets.cnames[0] ? (
                      <li className="mono">
                        Type CNAME, name {host.host}, value {targets.cnames[0]}
                      </li>
                    ) : null}
                    {targets.addresses[0] ? (
                      <li className="mono">For a domain without www or another prefix: type A, value {targets.addresses[0]}</li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {canManage ? (
          <form action={addDomain} className="panel grid" autoComplete="off">
            <input type="hidden" name="return_to" value={returnTo} />
            <input type="hidden" name="brand_id" value={brand.id} />
            <label>
              Domain
              <input type="text" name="host" required placeholder={brand.domain} />
            </label>
            <fieldset>
              <legend>Purpose</legend>
              <label style={{ fontWeight: 400 }}>
                <input type="radio" name="purpose" value="site" defaultChecked /> Site
              </label>
              <label style={{ fontWeight: 400 }}>
                <input type="radio" name="purpose" value="links" /> Links only
              </label>
            </fieldset>
            <div className="wide">
              <button type="submit">Add domain</button>
            </div>
          </form>
        ) : null}
      </section>

      {siteRow?.status === "live" ? (
        <section className="stack" aria-labelledby="signup">
          <div>
            <h2 id="signup">Email sign-up</h2>
            <p className="lede">
              {siteRow.signup_enabled ? "On." : "Off."} No emails are sent yet. Sign-ups wait for confirmation until the
              email platform is connected.
            </p>
          </div>
          {canManage ? (
            <form action={setSignup}>
              <input type="hidden" name="brand_id" value={brand.id} />
              <input type="hidden" name="on" value={siteRow.signup_enabled ? "false" : "true"} />
              <button type="submit" className={siteRow.signup_enabled ? "quiet" : undefined}>
                {siteRow.signup_enabled ? "Turn sign-up off" : "Turn sign-up on"}
              </button>
            </form>
          ) : null}
          <p data-subscriber-count={typeof count === "number" ? count : 0}>
            Subscribers: {typeof count === "number" ? count : 0}
          </p>
          {canApprove && subscribers.length > 0 ? (
            <ul className="rows" aria-label="Subscribers">
              {subscribers.map((subscriber) => (
                <li key={subscriber.id}>
                  <div className="split">
                    <div>
                      <strong>{subscriber.email}</strong>
                      <div className="hint">
                        Signed up on {date(subscriber.consented_at)}
                        {subscriber.source_page ? `, page ${subscriber.source_page}` : ""}, waiting for confirmation
                      </div>
                    </div>
                    {canManage ? (
                      <form action={deleteSubscriber}>
                        <input type="hidden" name="brand_id" value={brand.id} />
                        <input type="hidden" name="subscriber_id" value={subscriber.id} />
                        <button type="submit" className="quiet" aria-label={`Delete ${subscriber.email}`}>
                          Delete
                        </button>
                      </form>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          {canManage ? (
            <p className="hint">
              Delete is for a person who asks to be forgotten: their address is removed and the record of the deletion keeps
              no address. Supabase's own backups keep it until they expire.
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
