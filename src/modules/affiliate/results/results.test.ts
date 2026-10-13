import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ENV_KEY_REF,
  fetchOrders,
  importNotice,
  importRefusal,
  orderToInsert,
  parseSaleDate,
  sumCommission,
  summariseImport,
} from "./clickbank";
import { aggregateOfferMetrics, summariseSales } from "./results";
import type { CBOrder } from "./clickbank";
import type { SaleRow } from "./results";

// ---------------------------------------------------------------------------
// parseSaleDate
// ---------------------------------------------------------------------------
describe("parseSaleDate", () => {
  it("parses Unix milliseconds", () => {
    // 2024-01-15T00:00:00.000Z in ms
    expect(parseSaleDate(1705276800000)).toBe("2024-01-15T00:00:00.000Z");
  });

  it("parses Unix seconds", () => {
    // 2024-01-15T00:00:00.000Z in seconds
    expect(parseSaleDate(1705276800)).toBe("2024-01-15T00:00:00.000Z");
  });

  it("parses an ISO date string", () => {
    expect(parseSaleDate("2024-06-01T12:00:00.000Z")).toBe("2024-06-01T12:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// sumCommission
// ---------------------------------------------------------------------------
describe("sumCommission", () => {
  it("returns 0 for no line items", () => {
    expect(sumCommission(undefined)).toBe(0);
    expect(sumCommission([])).toBe(0);
  });

  it("returns the single item amount", () => {
    expect(sumCommission([{ accountAmount: 21.00 }])).toBe(21.00);
  });

  it("sums multiple line items (order bump + main product)", () => {
    expect(
      sumCommission([
        { productTitle: "Main", accountAmount: 21.00 },
        { productTitle: "Bump", accountAmount: 5.50 },
      ])
    ).toBeCloseTo(26.50);
  });

  it("treats a missing accountAmount as zero", () => {
    expect(sumCommission([{ productTitle: "No amount" }])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// orderToInsert
// ---------------------------------------------------------------------------
describe("orderToInsert", () => {
  const clientId = "client-1";
  const linksByCode = new Map([
    ["abc12345", { id: "link-1", brand_id: "brand-1", offer_id: "offer-1" }],
  ]);

  const saleOrder: CBOrder = {
    receipt: "RCPT001",
    transactionTime: 1705276800000,
    trackingId: "abc12345",
    transactionType: "SALE",
    vendor: "sellerx",
    totalOrderAmount: 42.00,
    lineItemData: [{ productTitle: "Offer X", accountAmount: 21.00 }],
  };

  it("maps a matched SALE to the correct link and offer", () => {
    const row = orderToInsert(saleOrder, clientId, linksByCode);
    expect(row).not.toBeNull();
    expect(row!.transaction_type).toBe("sale");
    expect(row!.link_id).toBe("link-1");
    expect(row!.brand_id).toBe("brand-1");
    expect(row!.offer_id).toBe("offer-1");
    expect(row!.commission).toBe(21.00);
    expect(row!.is_test).toBe(false);
  });

  it("stores an unmatched sale with null ids", () => {
    const row = orderToInsert({ ...saleOrder, trackingId: "unknown" }, clientId, linksByCode);
    expect(row).not.toBeNull();
    expect(row!.link_id).toBeNull();
    expect(row!.brand_id).toBeNull();
    expect(row!.offer_id).toBeNull();
  });

  it("maps TEST_SALE to transaction_type sale with is_test true", () => {
    const row = orderToInsert({ ...saleOrder, transactionType: "TEST_SALE" }, clientId, linksByCode);
    expect(row!.transaction_type).toBe("sale");
    expect(row!.is_test).toBe(true);
  });

  it("maps RFND to transaction_type refund", () => {
    const row = orderToInsert({ ...saleOrder, transactionType: "RFND" }, clientId, linksByCode);
    expect(row!.transaction_type).toBe("refund");
    expect(row!.is_test).toBe(false);
  });

  it("returns null for an unknown transaction type", () => {
    const row = orderToInsert({ ...saleOrder, transactionType: "UNKNOWN" }, clientId, linksByCode);
    expect(row).toBeNull();
  });

  it("stores the raw tracking ID", () => {
    const row = orderToInsert(saleOrder, clientId, linksByCode);
    expect(row!.tracking_id).toBe("abc12345");
  });

  it("stores a refund amount exactly as ClickBank sends it, negative or positive", () => {
    const negative = orderToInsert(
      { ...saleOrder, transactionType: "RFND", lineItemData: [{ accountAmount: -21 }] },
      clientId,
      linksByCode
    );
    const positive = orderToInsert(
      { ...saleOrder, transactionType: "CGBK", lineItemData: [{ accountAmount: 21 }] },
      clientId,
      linksByCode
    );
    expect(negative!.commission).toBe(-21);
    expect(positive!.transaction_type).toBe("chargeback");
    expect(positive!.commission).toBe(21);
  });

  it("keeps no customer personal data even when ClickBank sends it", () => {
    const withPii = {
      ...saleOrder,
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      postalCode: "90210",
    } as CBOrder;
    const row = orderToInsert(withPii, clientId, linksByCode)!;
    const stored = JSON.stringify(row);
    for (const value of ["Jane", "Doe", "jane@example.com", "90210"]) {
      expect(stored).not.toContain(value);
    }
  });
});

// ---------------------------------------------------------------------------
// importRefusal — who may run an import, and for which client
// ---------------------------------------------------------------------------
describe("importRefusal", () => {
  it("refuses when no ClickBank connection is visible (client roles see none)", () => {
    expect(importRefusal([])).toMatch(/owner or an operator/);
  });

  it("refuses a client whose connection is not the key on the server", () => {
    expect(importRefusal([{ secret_ref: "vault/clickbank-other" }])).toMatch(/not connected yet/);
  });

  it("allows the client that owns the key on the server", () => {
    expect(importRefusal([{ secret_ref: ENV_KEY_REF }])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// summariseImport and importNotice — what the person is told after an import
// ---------------------------------------------------------------------------
describe("summariseImport", () => {
  const links = new Map([["abc12345", { id: "link-1", brand_id: "brand-1", offer_id: "offer-1" }]]);
  const base: CBOrder = {
    receipt: "R1",
    transactionTime: 1705276800000,
    transactionType: "SALE",
    lineItemData: [{ accountAmount: 10 }],
  };
  const rows = [
    orderToInsert({ ...base, receipt: "R1", trackingId: "abc12345" }, "c", links)!,
    orderToInsert({ ...base, receipt: "R2", trackingId: "zzz" }, "c", links)!,
    orderToInsert({ ...base, receipt: "R3" }, "c", links)!,
  ];

  it("separates new rows from rows already imported", () => {
    const r = summariseImport(rows, 1);
    expect(r).toEqual({ fetched: 3, inserted: 1, alreadyImported: 2, matched: 1, unmatched: 2 });
  });

  it("reports a re-import with nothing new as all already imported", () => {
    expect(importNotice(summariseImport(rows, 0))).toBe(
      "ClickBank returned 3 transactions: 0 new, 3 already imported. " +
        "1 matched a tracked link; 2 did not and are shown on the client page."
    );
  });

  it("says plainly when ClickBank returned nothing", () => {
    expect(importNotice(summariseImport([], 0))).toBe(
      "ClickBank returned no transactions for that date range."
    );
  });
});

// ---------------------------------------------------------------------------
// summariseSales — the totals used for both brand and unmatched figures
// ---------------------------------------------------------------------------
describe("summariseSales", () => {
  it("nets a sale against a chargeback and ignores test orders", () => {
    const s = summariseSales([
      { transaction_type: "sale", commission: 30, is_test: false },
      { transaction_type: "chargeback", commission: -30, is_test: false },
      { transaction_type: "sale", commission: 99, is_test: true },
      { transaction_type: "rebill", commission: 12, is_test: false },
    ]);
    expect(s).toEqual({ conversions: 2, grossRevenue: 42, refundedAmount: 30, netCommission: 12 });
  });

  it("ignores fee rows in all totals", () => {
    const s = summariseSales([{ transaction_type: "fee", commission: -1, is_test: false }]);
    expect(s.netCommission).toBe(0);
    expect(s.conversions).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// aggregateOfferMetrics — refund handling (positive and negative amounts)
// ---------------------------------------------------------------------------
describe("aggregateOfferMetrics", () => {
  const offers = [{ id: "offer-1", name: "Test Offer", channel: "organic" }];

  it("counts a sale and computes EPC", () => {
    const sales: SaleRow[] = [
      { offer_id: "offer-1", transaction_type: "sale", commission: 21.00, is_test: false },
    ];
    const result = aggregateOfferMetrics(offers, new Map([["offer-1", 100]]), sales);
    expect(result[0].conversions).toBe(1);
    expect(result[0].grossRevenue).toBeCloseTo(21.00);
    expect(result[0].netCommission).toBeCloseTo(21.00);
    expect(result[0].epc).toBeCloseTo(0.21);
    expect(result[0].conversionRate).toBeCloseTo(0.01);
  });

  it("subtracts a refund with a negative commission amount", () => {
    const sales: SaleRow[] = [
      { offer_id: "offer-1", transaction_type: "sale",   commission:  21.00, is_test: false },
      { offer_id: "offer-1", transaction_type: "refund", commission: -21.00, is_test: false },
    ];
    const result = aggregateOfferMetrics(offers, new Map([["offer-1", 100]]), sales);
    expect(result[0].conversions).toBe(1);      // refund row is not a conversion
    expect(result[0].refundedAmount).toBeCloseTo(21.00);
    expect(result[0].netCommission).toBeCloseTo(0);
  });

  it("subtracts a refund with a positive commission amount", () => {
    // ClickBank may return the refund amount as positive; abs() normalises it.
    const sales: SaleRow[] = [
      { offer_id: "offer-1", transaction_type: "sale",   commission: 21.00, is_test: false },
      { offer_id: "offer-1", transaction_type: "refund", commission: 21.00, is_test: false },
    ];
    const result = aggregateOfferMetrics(offers, new Map([["offer-1", 100]]), sales);
    expect(result[0].refundedAmount).toBeCloseTo(21.00);
    expect(result[0].netCommission).toBeCloseTo(0);
  });

  it("counts rebills as conversions and includes them in revenue", () => {
    const sales: SaleRow[] = [
      { offer_id: "offer-1", transaction_type: "sale",   commission: 21.00, is_test: false },
      { offer_id: "offer-1", transaction_type: "rebill", commission: 10.00, is_test: false },
    ];
    const result = aggregateOfferMetrics(offers, new Map(), sales);
    expect(result[0].conversions).toBe(2);  // both sale and rebill are conversions
    expect(result[0].grossRevenue).toBeCloseTo(31.00);
  });

  it("excludes test sales from all metrics", () => {
    const sales: SaleRow[] = [
      { offer_id: "offer-1", transaction_type: "sale", commission: 21.00, is_test: true },
    ];
    const result = aggregateOfferMetrics(offers, new Map(), sales);
    expect(result[0].conversions).toBe(0);
    expect(result[0].netCommission).toBeCloseTo(0);
  });

  it("returns null EPC when there are no clicks", () => {
    const sales: SaleRow[] = [
      { offer_id: "offer-1", transaction_type: "sale", commission: 21.00, is_test: false },
    ];
    const result = aggregateOfferMetrics(offers, new Map(), sales);
    expect(result[0].epc).toBeNull();
    expect(result[0].conversionRate).toBeNull();
  });

  it("returns zero metrics for an offer with no activity", () => {
    const result = aggregateOfferMetrics(offers, new Map(), []);
    expect(result[0].clicks).toBe(0);
    expect(result[0].conversions).toBe(0);
    expect(result[0].netCommission).toBeCloseTo(0);
  });
});

// ---------------------------------------------------------------------------
// fetchOrders — pagination (mocked fetch)
// ---------------------------------------------------------------------------
describe("fetchOrders", () => {
  beforeEach(() => {
    process.env.CLICKBANK_API_KEY = "test-api-key";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CLICKBANK_API_KEY;
  });

  it("collects orders across two pages", async () => {
    const page1Order: CBOrder = {
      receipt: "R001",
      transactionTime: 1705276800000,
      transactionType: "SALE",
      lineItemData: [{ accountAmount: 21 }],
    };
    const page2Order: CBOrder = {
      receipt: "R002",
      transactionTime: 1705276800000,
      transactionType: "SALE",
      lineItemData: [{ accountAmount: 15 }],
    };

    let callCount = 0;
    vi.stubGlobal("fetch", async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          status: 206, // partial — more pages
          json: async () => ({ orderData: [page1Order] }),
        };
      }
      return {
        ok: true,
        status: 200, // final page
        json: async () => ({ orderData: [page2Order] }),
      };
    });

    const orders = await fetchOrders("2024-01-01", "2024-01-31");
    expect(orders).toHaveLength(2);
    expect(orders[0].receipt).toBe("R001");
    expect(orders[1].receipt).toBe("R002");
    expect(callCount).toBe(2);
  });

  it("returns an empty array when there are no orders", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      status: 200,
      json: async () => ({ orderData: [] }),
    }));
    const orders = await fetchOrders("2024-01-01", "2024-01-31");
    expect(orders).toHaveLength(0);
  });

  it("logs field names only, never values", async () => {
    const order = {
      receipt: "SECRETRCPT",
      transactionTime: 1705276800000,
      transactionType: "SALE",
      trackingId: "secrettid",
      vendor: "secretvendor",
      email: "buyer@example.com",
      lineItemData: [{ productTitle: "Secret Product", accountAmount: 12.34 }],
    };
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      status: 200,
      json: async () => ({ orderData: [order] }),
    }));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await fetchOrders("2024-01-01", "2024-01-31");

    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain("receipt"); // field names are logged
    for (const value of ["SECRETRCPT", "secrettid", "secretvendor", "buyer@example.com", "Secret Product", "12.34"]) {
      expect(logged).not.toContain(value);
    }
  });

  it("logs no values from an error response", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: "key API-secret123 is not allowed" }),
    }));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(fetchOrders("2024-01-01", "2024-01-31")).rejects.toThrow("403");
    expect(JSON.stringify(err.mock.calls)).not.toContain("secret123");
  });

  it("throws when the API returns an error status", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: "Unauthorized" }),
    }));
    await expect(fetchOrders("2024-01-01", "2024-01-31")).rejects.toThrow("401");
  });
});
