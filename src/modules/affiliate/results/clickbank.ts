import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

// NOTE: CLICKBANK_API_KEY is read from server-only environment variables.
// This is temporary. Per-brand credentials belong in the connections table
// with a vault reference (C-05). Replace this env var when the connections
// screen is built in increment 6.

const API_BASE = "https://api.clickbank.com/rest/1.3";

// ClickBank Order API v1.3 response types.
// Only the fields we store are typed; customer PII fields (firstName,
// lastName, email, postalCode, country, state, fullName) are intentionally
// absent so they can never be stored.
export interface CBLineItem {
  productTitle?: string;
  accountAmount?: number;
  lineItemType?: string;
}

export interface CBOrder {
  receipt: string;
  transactionTime: string | number;
  trackingId?: string;
  transactionType: string; // SALE, RFND, CGBK, BILL, FEE, TEST_SALE, TEST_RFND, TEST_BILL
  vendor?: string;
  totalOrderAmount?: number;
  lineItemData?: CBLineItem[];
}

interface CBOrdersResponse {
  orderData?: CBOrder[];
}

// Maps ClickBank transaction type codes to the values stored in network_sales.
// TEST_* variants are stored with is_test = true.
const TX_TYPE_MAP: Record<string, string> = {
  SALE: "sale",
  RFND: "refund",
  CGBK: "chargeback",
  BILL: "rebill",
  FEE: "fee",
  TEST_SALE: "sale",
  TEST_RFND: "refund",
  TEST_BILL: "rebill",
};

function apiKey(): string {
  const key = process.env.CLICKBANK_API_KEY;
  if (!key) throw new Error("CLICKBANK_API_KEY is not set");
  return key;
}

async function fetchPage(
  params: URLSearchParams,
  page: number
): Promise<{ orders: CBOrder[]; hasMore: boolean }> {
  const url = `${API_BASE}/orders2/list?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      Authorization: apiKey(),
      Accept: "application/json",
      Page: String(page),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    // Log status code and top-level error field names only; never log values.
    let errorFields: string[] = [];
    try {
      const body = await response.json();
      errorFields = Object.keys(body);
    } catch {
      // ignore unparseable body
    }
    console.error("[clickbank] API error", { status: response.status, fields: errorFields });
    throw new Error(`ClickBank API returned ${response.status}`);
  }

  const hasMore = response.status === 206;
  const data = (await response.json()) as CBOrdersResponse;

  // Diagnostic: log response shape from the first record only; never log values.
  const firstOrder = data.orderData?.[0];
  if (firstOrder) {
    console.log("[clickbank] order fields present:", Object.keys(firstOrder).sort());
    const firstItem = firstOrder.lineItemData?.[0];
    if (firstItem) {
      console.log("[clickbank] lineItem fields present:", Object.keys(firstItem).sort());
    }
  }

  return { orders: data.orderData ?? [], hasMore };
}

// Fetch all orders for a date range, handling ClickBank's pagination.
// Status 206 means more pages; 200 means the final page.
export async function fetchOrders(startDate: string, endDate: string): Promise<CBOrder[]> {
  const params = new URLSearchParams({ role: "AFFILIATE", startDate, endDate });
  const all: CBOrder[] = [];
  let page = 1;
  while (true) {
    const { orders, hasMore } = await fetchPage(params, page);
    all.push(...orders);
    if (!hasMore) break;
    page++;
  }
  return all;
}

// Normalise transactionTime to an ISO timestamp string.
// ClickBank may return Unix milliseconds, Unix seconds, or an ISO string.
export function parseSaleDate(transactionTime: string | number): string {
  const n = Number(transactionTime);
  if (!Number.isNaN(n) && n > 0) {
    // Treat values above 1e12 as milliseconds; below as seconds.
    const ms = n > 1e12 ? n : n * 1000;
    return new Date(ms).toISOString();
  }
  return new Date(String(transactionTime)).toISOString();
}

// Sum accountAmount across all line items for one receipt.
// Multi-item orders (order bumps, upsells) each carry their own commission.
export function sumCommission(lineItems?: CBLineItem[]): number {
  if (!lineItems || lineItems.length === 0) return 0;
  return lineItems.reduce((sum, item) => sum + (item.accountAmount ?? 0), 0);
}

export interface NetworkSaleInsert {
  client_id: string;
  brand_id: string | null;
  offer_id: string | null;
  link_id: string | null;
  network: string;
  order_ref: string;
  transaction_type: string;
  is_test: boolean;
  sale_date: string;
  commission: number;
  gross_sale: number | null;
  vendor: string | null;
  product_title: string | null;
  tracking_id: string | null;
}

// Convert a CBOrder to a database insert row.
// Returns null for unknown transaction types (unknown types are skipped).
// Matching: trackingId from the order → link tracking_code. Unmatched
// orders are stored with brand_id, offer_id, and link_id all null.
export function orderToInsert(
  order: CBOrder,
  clientId: string,
  linksByCode: Map<string, { id: string; brand_id: string; offer_id: string }>
): NetworkSaleInsert | null {
  const txType = TX_TYPE_MAP[order.transactionType];
  if (!txType) return null;

  const isTest = order.transactionType.startsWith("TEST_");
  const tid = order.trackingId ?? null;
  const matched = tid ? linksByCode.get(tid) : undefined;

  return {
    client_id: clientId,
    brand_id: matched?.brand_id ?? null,
    offer_id: matched?.offer_id ?? null,
    link_id: matched?.id ?? null,
    network: "clickbank",
    order_ref: order.receipt,
    transaction_type: txType,
    is_test: isTest,
    sale_date: parseSaleDate(order.transactionTime),
    commission: sumCommission(order.lineItemData),
    gross_sale: order.totalOrderAmount ?? null,
    vendor: order.vendor ?? null,
    product_title: order.lineItemData?.[0]?.productTitle ?? null,
    tracking_id: tid,
  };
}

export interface ImportResult {
  fetched: number;
  inserted: number;
  alreadyImported: number;
  matched: number;
  unmatched: number;
}

// The connection row that says this client owns the key in CLICKBANK_API_KEY.
export const ENV_KEY_REF = "env:CLICKBANK_API_KEY";

// Decide, from the ClickBank connection rows the signed-in user can see for a
// client, whether an import may run. Returns a plain-language refusal, or null.
// Row-level security hides connections from client roles (C-05), so for them
// the list is empty and the import is refused before ClickBank is called.
export function importRefusal(connections: Array<{ secret_ref: string | null }>): string | null {
  if (connections.length === 0) {
    return "Sales can only be imported by the platform owner or an operator, for a client with a ClickBank connection.";
  }
  if (!connections.some((c) => c.secret_ref === ENV_KEY_REF)) {
    return "This client's ClickBank account is not connected yet. Only the account whose key is set on the server can be imported for now.";
  }
  return null;
}

// Import all ClickBank orders for a date range into network_sales.
// Operates at account level: loads all tracked links for the client,
// then matches orders to links by tracking_code. Unmatched orders are
// stored with brand_id = null and shown at client level in the dashboard.
// A transaction already stored (same network, receipt, type, and time) is
// skipped by the database unique constraint and counted as already imported.
export async function importForClient(
  supabase: SupabaseClient,
  clientId: string,
  startDate: string,
  endDate: string
): Promise<ImportResult> {
  const { data: connections, error: connError } = await supabase
    .from("connections")
    .select("secret_ref")
    .eq("client_id", clientId)
    .eq("provider", "clickbank");
  if (connError) throw new Error(`Could not check the ClickBank connection: ${connError.message}`);
  const refusal = importRefusal(connections ?? []);
  if (refusal) throw new Error(refusal);

  const { data: links, error: linkError } = await supabase
    .from("tracked_links")
    .select("id, brand_id, offer_id, tracking_code")
    .eq("client_id", clientId);
  if (linkError) throw new Error(`Could not load tracked links: ${linkError.message}`);

  const linksByCode = new Map<string, { id: string; brand_id: string; offer_id: string }>(
    (links ?? []).map((l) => [
      l.tracking_code as string,
      {
        id: l.id as string,
        brand_id: l.brand_id as string,
        offer_id: l.offer_id as string,
      },
    ])
  );

  const orders = await fetchOrders(startDate, endDate);

  const rows: NetworkSaleInsert[] = [];
  for (const order of orders) {
    const row = orderToInsert(order, clientId, linksByCode);
    if (row) rows.push(row);
  }

  if (rows.length === 0) {
    return { fetched: 0, inserted: 0, alreadyImported: 0, matched: 0, unmatched: 0 };
  }

  // With ignoreDuplicates, only newly inserted rows come back.
  const { data: inserted, error } = await supabase
    .from("network_sales")
    .upsert(rows, {
      onConflict: "network,order_ref,transaction_type,sale_date",
      ignoreDuplicates: true,
    })
    .select("id");

  if (error) throw new Error(`Import failed: ${error.message}`);

  return summariseImport(rows, inserted?.length ?? 0);
}

// The sentence shown after an import.
export function importNotice(r: ImportResult): string {
  if (r.fetched === 0) return "ClickBank returned no transactions for that date range.";
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return (
    `ClickBank returned ${plural(r.fetched, "transaction")}: ${r.inserted} new, ` +
    `${r.alreadyImported} already imported. ` +
    `${r.matched} matched a tracked link; ${r.unmatched} did not and are shown on the client page.`
  );
}

// Counts reported back to the person who ran the import.
export function summariseImport(rows: NetworkSaleInsert[], insertedCount: number): ImportResult {
  return {
    fetched: rows.length,
    inserted: insertedCount,
    alreadyImported: rows.length - insertedCount,
    matched: rows.filter((r) => r.link_id !== null).length,
    unmatched: rows.filter((r) => r.link_id === null).length,
  };
}
