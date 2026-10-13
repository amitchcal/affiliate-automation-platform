import { notFound } from "next/navigation";
import { createClient } from "@/core/supabase/server";
import { StatusMessages } from "@/core/components/StatusMessages";
import { loadScoringConfig } from "@/core/scoring/scoring-config";
import { latestMetrics, MetricsRow, RulesRow, toOfferInput } from "@/modules/affiliate/offers/offers";
import { PARAMETER_LABELS } from "@/core/scoring/config";
import { Channel, scoreOffer } from "@/core/scoring/score";
import { addOffer, approveOffer, approveRules } from "./actions";

const CHANNEL_LABEL: Record<Channel, string> = {
  paid: "Paid ads",
  organic: "Free traffic",
  reject: "Not recommended",
  needs_data: "More data needed",
};
const CHANNEL_ORDER: Record<Channel, number> = { paid: 0, organic: 1, needs_data: 2, reject: 3 };
const NETWORK_LABEL: Record<string, string> = { clickbank: "ClickBank", other: "another network" };

/** The score is shown as a large numeral, so the sentence restating it is dropped here. */
const withoutScoreSentence = (explanation: string) => explanation.replace(/^Scores \d+ out of 100[^.]*\.\s*/, "");

interface OfferRow {
  id: string;
  name: string;
  network: string;
  source: "suggested" | "client_supplied";
  status: "draft" | "scored" | "approved" | "rejected" | "retired";
  affiliate_link: string | null;
  offer_metrics: MetricsRow[];
  offer_rules: RulesRow | RulesRow[] | null;
}

export default async function OffersPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { brandId } = await params;
  const { notice, error } = await searchParams;
  const supabase = await createClient();

  const { data: brand } = await supabase
    .from("brands")
    .select("id, client_id")
    .eq("id", brandId)
    .maybeSingle();
  if (!brand) notFound();

  const { data: offerRows } = await supabase
    .from("offers")
    .select("id, name, network, source, status, affiliate_link, offer_metrics(*), offer_rules(*)")
    .eq("brand_id", brandId);

  const config = await loadScoringConfig(supabase, brand.client_id, brandId);

  // Scores are recomputed from the stored figures on each view, so a change
  // to the weights in configuration shows at once (C-08).
  const offers = ((offerRows ?? []) as unknown as OfferRow[])
    .map((offer) => {
      const rules = Array.isArray(offer.offer_rules) ? offer.offer_rules[0] ?? null : offer.offer_rules;
      const metrics = latestMetrics(offer.offer_metrics);
      return { offer, rules, metrics, result: scoreOffer(toOfferInput(offer.name, metrics, rules), config) };
    })
    .sort(
      (a, b) =>
        CHANNEL_ORDER[a.result.channel] - CHANNEL_ORDER[b.result.channel] || b.result.score - a.result.score,
    );

  return (
    <main className="stack">
      <StatusMessages notice={notice} error={error} />

      <section className="stack" aria-labelledby="offers">
        <div>
          <h2 id="offers">Offers</h2>
          <p className="lede">
            Ranked best first. A paid click is expected to cost about ${config.expectedCostPerClick.toFixed(2)} for
            this brand.
          </p>
        </div>
        {offers.length === 0 ? (
          <p className="panel empty">No offers yet. Add the first one below to see its score.</p>
        ) : (
          <ul className="rows">
            {offers.map(({ offer, rules, result }) => (
              <li key={offer.id}>
                <div className="offer">
                  <div className="score">
                    {result.score}
                    <small>out of 100</small>
                  </div>
                  <div>
                    <h3>
                      {offer.name}
                      <span className={`tag ${result.channel}`}>{CHANNEL_LABEL[result.channel]}</span>
                    </h3>
                    <p className="explain">{withoutScoreSentence(result.explanation)}</p>
                    <div className="bars" aria-hidden="true">
                      {result.parameters.map((parameter) => (
                        <div
                          key={parameter.key}
                          className={parameter.score === undefined ? "bar unknown" : "bar"}
                          title={`${PARAMETER_LABELS[parameter.key]}: ${
                            parameter.score === undefined ? "not known" : Math.round(parameter.score)
                          }`}
                        >
                          {parameter.score !== undefined ? <i style={{ width: `${parameter.score}%` }} /> : null}
                        </div>
                      ))}
                    </div>
                    <p className="meta">
                      {offer.source === "client_supplied" ? "Supplied by the client" : "Suggested"}, on{" "}
                      {NETWORK_LABEL[offer.network] ?? offer.network}.{" "}
                      {result.provisional ? "Score is provisional until the seller's rules are recorded. " : null}
                      {result.missing.length > 0
                        ? `Not yet known: ${result.missing.map((key) => PARAMETER_LABELS[key]).join(", ")}.`
                        : "All figures recorded."}{" "}
                      {offer.status === "approved" ? "Approved." : null}
                    </p>
                    <div className="actions">
                      {rules && !rules.approved ? (
                        <form action={approveRules}>
                          <input type="hidden" name="brand_id" value={brand.id} />
                          <input type="hidden" name="offer_id" value={offer.id} />
                          <button type="submit" className="quiet">Approve seller's rules</button>
                        </form>
                      ) : null}
                      {offer.status !== "approved" && result.channel !== "reject" ? (
                        <form action={approveOffer}>
                          <input type="hidden" name="brand_id" value={brand.id} />
                          <input type="hidden" name="offer_id" value={offer.id} />
                          <button type="submit">Approve offer</button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="stack" aria-labelledby="add">
        <div>
          <h2 id="add">Add an offer</h2>
          <p className="lede">
            Enter what you know. Blank figures are treated as not yet known, and the score says what is missing.
          </p>
        </div>
        <form key={`offer:${offers.length}`} action={addOffer} className="panel grid">
          <input type="hidden" name="brand_id" value={brand.id} />
          <label>
            Offer name
            <input type="text" name="name" required />
          </label>
          <label>
            Who chose it
            <select name="source" defaultValue="suggested">
              <option value="suggested">Suggested by the platform</option>
              <option value="client_supplied">Supplied by the client</option>
            </select>
          </label>
          <label>
            Network
            <select name="network" defaultValue="clickbank">
              <option value="clickbank">ClickBank</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Seller ID <span className="hint">The seller's nickname on the network.</span>
            <input type="text" name="seller_ref" />
          </label>
          <label className="wide">
            Your affiliate link
            <input type="url" name="affiliate_link" placeholder="https://" />
          </label>
          <label className="wide">
            Seller's sales page
            <input type="url" name="sales_page_url" placeholder="https://" />
          </label>
          <label>
            Payout per sale ($)
            <input type="number" name="payout" min="0" step="0.01" />
          </label>
          <label>
            Conversion rate (%)
            <input type="number" name="conversion_rate" min="0" step="0.01" />
          </label>
          <label>
            Earnings per click ($)
            <input type="number" name="epc" min="0" step="0.01" />
          </label>
          <label>
            Gravity
            <input type="number" name="gravity" min="0" step="0.01" />
          </label>
          <label>
            Refund rate (%)
            <input type="number" name="refund_rate" min="0" step="0.1" />
          </label>
          <label>
            Does a sale keep paying?
            <select name="recurring" defaultValue="">
              <option value="">Not known</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label>
            Compliance risk <span className="hint">How restricted the claims are, such as health or income.</span>
            <select name="compliance_risk" defaultValue="">
              <option value="">Not yet assessed</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label>
            Seller restrictions <span className="hint">How tightly the seller limits promotion.</span>
            <select name="seller_restrictions" defaultValue="">
              <option value="">Not yet assessed</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label className="wide">
            Seller's affiliate terms page
            <input type="url" name="terms_url" placeholder="https://" />
          </label>
          <div className="wide">
            <button type="submit">Add and score offer</button>
          </div>
        </form>
      </section>
    </main>
  );
}
