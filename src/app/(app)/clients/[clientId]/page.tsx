import Link from "next/link";
import { failedHosts, failedHostWarning } from "@/core/domains/DomainWarnings";
import { notFound } from "next/navigation";
import { getClientUnmatched } from "@/modules/affiliate/results/results";
import { StatusMessages } from "@/core/components/StatusMessages";
import { businessTypeLabel } from "@/core/modules";
import { createClient } from "@/core/supabase/server";

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { clientId } = await params;
  const { notice, error } = await searchParams;
  const supabase = await createClient();

  const [{ data: client }, unmatched, { data: own }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, brands(id, name, domain, niche, business_type)")
      .eq("id", clientId)
      .maybeSingle(),
    getClientUnmatched(supabase, clientId),
    supabase.from("memberships").select("role, client_id"),
  ]);
  if (!client) notFound();
  // Batch 2, addition 4: a live brand whose domain check failed is flagged in its row.
  const warnings = await failedHosts(supabase, client.brands.map((brand) => brand.id));
  // People (T-03) is for the owner and this client's admins; the database enforces it.
  const managesPeople = (own ?? []).some(
    (row) => row.role === "owner" || (row.role === "client_admin" && row.client_id === clientId),
  );

  const unmatchedNet = unmatched.netCommission;
  const hasUnmatched = unmatched.records > 0;

  return (
    <main className="stack">
      <div>
        <p className="crumbs">
          <Link href="/clients">Clients</Link>
        </p>
        <h1>{client.name}</h1>
        <p className="lede">Choose a brand to open its overview. Each brand shows only the features its business type uses.</p>
        {managesPeople ? (
          <p>
            <Link href={`/clients/${client.id}/people`}>People</Link>: members and invitations
          </p>
        ) : null}
      </div>
      <StatusMessages notice={notice} error={error} />
      {client.brands.length > 0 ? (
        <ul className="rows">
          {client.brands.map((brand) => (
            <li key={brand.id}>
              <Link href={`/brands/${brand.id}`} className="rowlink">
                <strong>{brand.name}</strong>
                <span>
                  {businessTypeLabel(brand.business_type)}, {brand.domain}
                  {brand.niche ? `, ${brand.niche}` : ", niche not chosen"}
                </span>
              </Link>
              {warnings
                .filter((host) => host.brand_id === brand.id)
                .map((host) => (
                  <p key={host.host} className="error" role="alert" data-warning="domain-check">
                    {failedHostWarning(host)}
                  </p>
                ))}
            </li>
          ))}
        </ul>
      ) : (
        <p className="panel empty">This client has no brands yet.</p>
      )}
      {hasUnmatched ? (
        <section className="stack" aria-labelledby="unmatched">
          <div>
            <h2 id="unmatched">Unmatched commissions</h2>
            <p className="lede">
              These sales were imported but their ClickBank tracking code did not match any tracked
              link. They may belong to a deleted link, an untracked test, or another site on the
              same account. Net:{" "}
              <strong>
                {unmatchedNet.toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                  minimumFractionDigits: 2,
                })}
              </strong>{" "}
              across {unmatched.records} record{unmatched.records === 1 ? "" : "s"} (all time,
              test orders excluded from the total).
            </p>
          </div>
        </section>
      ) : null}
    </main>
  );
}
