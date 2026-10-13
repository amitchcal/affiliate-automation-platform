import type { SupabaseClient } from "@supabase/supabase-js";

export interface OfferMetrics {
  offerId: string;
  offerName: string;
  channel: string | null;
  clicks: number;
  conversions: number;
  grossRevenue: number;
  refundedAmount: number;
  netCommission: number;
  epc: number | null;
  conversionRate: number | null;
}

export interface BrandMetrics {
  offers: OfferMetrics[];
  lastImportedAt: Date | null;
}

export interface ClientUnmatched {
  records: number;
  netCommission: number;
  lastImportedAt: Date | null;
}

// Internal type for a sale row as loaded from the database.
export interface SaleRow {
  offer_id: string | null;
  transaction_type: string;
  commission: number;
  is_test: boolean;
}

export interface SalesSummary {
  conversions: number;
  grossRevenue: number;
  refundedAmount: number;
  netCommission: number;
}

// Pure: totals for a set of sale rows. Test orders are ignored. Sales and
// rebills are conversions. Refund and chargeback commission values may arrive
// positive or negative; Math.abs() normalises both so netCommission is correct.
export function summariseSales(
  rows: Array<Pick<SaleRow, "transaction_type" | "commission" | "is_test">>
): SalesSummary {
  const live = rows.filter((s) => !s.is_test);
  const posRows = live.filter((s) => s.transaction_type === "sale" || s.transaction_type === "rebill");
  const negRows = live.filter((s) => s.transaction_type === "refund" || s.transaction_type === "chargeback");

  const grossRevenue = posRows.reduce((sum, s) => sum + Number(s.commission), 0);
  const refundedAmount = negRows.reduce((sum, s) => sum + Math.abs(Number(s.commission)), 0);
  return {
    conversions: posRows.length,
    grossRevenue,
    refundedAmount,
    netCommission: grossRevenue - refundedAmount,
  };
}

// Pure aggregation: combine clicks and sales into per-offer metrics.
export function aggregateOfferMetrics(
  offers: Array<{ id: string; name: string; channel: string | null }>,
  clicksByOffer: Map<string, number>,
  sales: SaleRow[]
): OfferMetrics[] {
  return offers.map((offer) => {
    const { conversions, grossRevenue, refundedAmount, netCommission } = summariseSales(
      sales.filter((s) => s.offer_id === offer.id)
    );
    const clicks = clicksByOffer.get(offer.id) ?? 0;

    return {
      offerId: offer.id,
      offerName: offer.name,
      channel: offer.channel,
      clicks,
      conversions,
      grossRevenue,
      refundedAmount,
      netCommission,
      epc: clicks > 0 ? netCommission / clicks : null,
      conversionRate: clicks > 0 ? conversions / clicks : null,
    };
  });
}

// Compute per-brand metrics for the results dashboard.
export async function getBrandMetrics(
  supabase: SupabaseClient,
  brandId: string,
  since: Date,
  until: Date
): Promise<BrandMetrics> {
  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();

  const [{ data: offers }, { data: clicks }, { data: sales }, { data: lastImport }] =
    await Promise.all([
      supabase
        .from("offers")
        .select("id, name, channel")
        .eq("brand_id", brandId)
        .eq("status", "approved"),
      supabase
        .from("click_events")
        .select("offer_id")
        .eq("brand_id", brandId)
        .gte("created_at", sinceIso)
        .lte("created_at", untilIso),
      supabase
        .from("network_sales")
        .select("offer_id, transaction_type, commission, is_test")
        .eq("brand_id", brandId)
        .gte("sale_date", sinceIso)
        .lte("sale_date", untilIso),
      supabase
        .from("network_sales")
        .select("imported_at")
        .eq("brand_id", brandId)
        .order("imported_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const clicksByOffer = new Map<string, number>();
  for (const row of clicks ?? []) {
    const id = row.offer_id as string;
    clicksByOffer.set(id, (clicksByOffer.get(id) ?? 0) + 1);
  }

  const offerList = (offers ?? []) as Array<{ id: string; name: string; channel: string | null }>;
  const saleList = (sales ?? []) as SaleRow[];

  return {
    offers: aggregateOfferMetrics(offerList, clicksByOffer, saleList),
    lastImportedAt: lastImport?.imported_at ? new Date(lastImport.imported_at as string) : null,
  };
}

// Unmatched sales for a client, all time: orders whose tracking code matched
// no known link.
export async function getClientUnmatched(
  supabase: SupabaseClient,
  clientId: string
): Promise<ClientUnmatched> {
  const { data } = await supabase
    .from("network_sales")
    .select("transaction_type, commission, is_test, imported_at")
    .eq("client_id", clientId)
    .is("brand_id", null);

  const rows = (data ?? []) as Array<{
    transaction_type: string;
    commission: number;
    is_test: boolean;
    imported_at: string;
  }>;

  const latestImport = rows.reduce(
    (latest: Date | null, r) => {
      const d = new Date(r.imported_at);
      return latest === null || d > latest ? d : latest;
    },
    null
  );

  return {
    records: rows.length,
    netCommission: summariseSales(rows).netCommission,
    lastImportedAt: latestImport,
  };
}
