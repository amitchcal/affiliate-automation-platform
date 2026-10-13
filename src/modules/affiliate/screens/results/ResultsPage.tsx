import { notFound } from "next/navigation";
import { createClient } from "@/core/supabase/server";
import { StatusMessages } from "@/core/components/StatusMessages";
import { getBrandMetrics, OfferMetrics } from "@/modules/affiliate/results/results";
import { importRefusal } from "@/modules/affiliate/results/clickbank";
import { importSales } from "./actions";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

const fmtPct = (n: number | null) =>
  n === null ? "—" : `${(n * 100).toFixed(1)}%`;

function parseDate(s: string | undefined, fallback: Date): Date {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

export default async function ResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<{ since?: string; until?: string; notice?: string; error?: string }>;
}) {
  const { brandId } = await params;
  const sp = await searchParams;

  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const since = parseDate(sp.since, thirtyDaysAgo);
  const until = parseDate(sp.until, today);
  // end of the until day
  until.setUTCHours(23, 59, 59, 999);

  const sinceStr = since.toISOString().slice(0, 10);
  const untilStr = until.toISOString().slice(0, 10);

  const supabase = await createClient();

  const { data: brand } = await supabase
    .from("brands")
    .select("id, client_id")
    .eq("id", brandId)
    .maybeSingle();
  if (!brand) notFound();

  // Connections are visible only to the owner and operators (C-05), so this
  // also decides who sees the import form. The import action checks again.
  const [metrics, { data: connections }] = await Promise.all([
    getBrandMetrics(supabase, brandId, since, until),
    supabase
      .from("connections")
      .select("secret_ref")
      .eq("client_id", brand.client_id)
      .eq("provider", "clickbank"),
  ]);
  const canImport = (connections ?? []).length > 0;
  const importBlocked = canImport ? importRefusal(connections ?? []) : null;

  const sortedOffers = [...metrics.offers].sort((a, b) => b.netCommission - a.netCommission);

  const totalClicks = sortedOffers.reduce((sum, o) => sum + o.clicks, 0);
  const totalConversions = sortedOffers.reduce((sum, o) => sum + o.conversions, 0);
  const totalNet = sortedOffers.reduce((sum, o) => sum + o.netCommission, 0);

  return (
    <main className="stack">
      <StatusMessages notice={sp.notice} error={sp.error} />

      <section className="stack" aria-labelledby="summary">
        <div className="split">
          <h2 id="summary">Results</h2>
          <form key={`range:${sinceStr}:${untilStr}`} method="get" className="inline" style={{ gap: 8, alignItems: "center" }}>
            <label>
              From
              <input type="date" name="since" defaultValue={sinceStr} style={{ marginLeft: 4 }} />
            </label>
            <label>
              to
              <input type="date" name="until" defaultValue={untilStr} style={{ marginLeft: 4 }} />
            </label>
            <button type="submit" className="quiet">Update</button>
          </form>
        </div>
        <p className="lede">
          {sinceStr} to {untilStr}.
          {metrics.lastImportedAt
            ? ` Last import: ${metrics.lastImportedAt.toISOString().slice(0, 16).replace("T", " ")} UTC.`
            : " No sales imported yet."}
        </p>
        <div className="panel grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>{totalClicks.toLocaleString()}</div>
            <div className="hint">Clicks</div>
          </div>
          <div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>{totalConversions.toLocaleString()}</div>
            <div className="hint">Sales</div>
          </div>
          <div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>{fmt(totalNet)}</div>
            <div className="hint">Net commission</div>
          </div>
        </div>
      </section>

      <section className="stack" aria-labelledby="by-offer">
        <h2 id="by-offer">By offer</h2>
        {sortedOffers.length === 0 ? (
          <p className="panel empty">No approved offers for this brand yet.</p>
        ) : (
          <div className="panel" style={{ overflowX: "auto" }}>
            <table className="links">
              <thead>
                <tr>
                  <th>Offer</th>
                  <th style={{ textAlign: "right" }}>Clicks</th>
                  <th style={{ textAlign: "right" }}>Sales</th>
                  <th style={{ textAlign: "right" }}>Conv. rate</th>
                  <th style={{ textAlign: "right" }}>Gross</th>
                  <th style={{ textAlign: "right" }}>Refunded</th>
                  <th style={{ textAlign: "right" }}>Net</th>
                  <th style={{ textAlign: "right" }}>EPC</th>
                </tr>
              </thead>
              <tbody>
                {sortedOffers.map((offer) => (
                  <OfferRow key={offer.offerId} offer={offer} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canImport ? (
        <section className="stack" aria-labelledby="import">
          <div>
            <h2 id="import">Import sales</h2>
            <p className="lede">
              Pulls sales from ClickBank for the whole account and matches them to tracked links by
              their tracking code. Transactions already imported are skipped. Sales with no matching
              link appear on the client page as unmatched commissions.
            </p>
          </div>
          {importBlocked ? (
            <p className="panel empty">{importBlocked}</p>
          ) : (
            <form key={`import:${sinceStr}:${untilStr}`} action={importSales} className="panel inline" style={{ alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
              <input type="hidden" name="brand_id" value={brand.id} />
              <label>
                From
                <input type="date" name="start_date" defaultValue={sinceStr} required />
              </label>
              <label>
                To
                <input type="date" name="end_date" defaultValue={untilStr} required />
              </label>
              <button type="submit">Import sales from ClickBank</button>
            </form>
          )}
          <p className="hint" style={{ paddingInline: "var(--panel-pad)" }}>
            Note: the ClickBank account has no real sales yet. The import is untested against live
            data and will be verified when the first sale is made.
          </p>
        </section>
      ) : null}
    </main>
  );
}

function OfferRow({ offer }: { offer: OfferMetrics }) {
  return (
    <tr>
      <td>
        {offer.offerName}
        {offer.channel ? <span className="hint" style={{ marginLeft: 6 }}>({offer.channel})</span> : null}
      </td>
      <td className="num">{offer.clicks.toLocaleString()}</td>
      <td className="num">{offer.conversions.toLocaleString()}</td>
      <td className="num">{fmtPct(offer.conversionRate)}</td>
      <td className="num">{fmt(offer.grossRevenue)}</td>
      <td className="num">{offer.refundedAmount > 0 ? fmt(offer.refundedAmount) : "—"}</td>
      <td className="num" style={{ fontWeight: offer.netCommission > 0 ? 600 : undefined }}>
        {fmt(offer.netCommission)}
      </td>
      <td className="num">{offer.epc !== null ? fmt(offer.epc) : "—"}</td>
    </tr>
  );
}
