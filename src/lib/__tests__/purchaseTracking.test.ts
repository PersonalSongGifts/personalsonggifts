import { describe, it, expect } from "vitest";
import {
  addonAlreadyReported,
  addonEventId,
  addonTransactionId,
  isPaymentRecentEnough,
  isReportableAmountCents,
  markAddonReported,
  markPurchaseReported,
  purchaseAlreadyReported,
  purchaseEventId,
  resolvePurchaseValue,
  PURCHASE_REPORT_MAX_AGE_MS,
} from "../purchaseTracking";

function memStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, v); },
    _map: m,
  };
}

describe("event ids", () => {
  it("keeps the base purchase id stable", () => {
    expect(purchaseEventId("ord-1")).toBe("purchase_ord-1");
  });
  it("uses addon_<kind>_<session> shared with the server", () => {
    expect(addonEventId("pkg", "cs_123")).toBe("addon_pkg_cs_123");
    expect(addonEventId("rush", "cs_123")).toBe("addon_rush_cs_123");
    expect(addonEventId("tip", "cs_9")).toBe("addon_tip_cs_9");
    expect(addonTransactionId("pkg", "cs_123")).toBe("pkg_cs_123");
  });
});

describe("amount validation suppresses reporting only", () => {
  it.each([undefined, null, 0, -5, NaN, Infinity, "24" as unknown])("rejects %p", (v) => {
    expect(isReportableAmountCents(v as never)).toBe(false);
  });
  it("accepts positive finite cents", () => {
    expect(isReportableAmountCents(2400)).toBe(true);
  });

  it("returns null when the verified base price is missing", () => {
    expect(resolvePurchaseValue({ package_addon_cents: 2400 })).toBeNull();
  });
  it("returns null for zero and negative base prices", () => {
    expect(resolvePurchaseValue({ price: 0 })).toBeNull();
    expect(resolvePurchaseValue({ price: -29 })).toBeNull();
  });
  it("returns null for non-finite base prices", () => {
    expect(resolvePurchaseValue({ price: NaN })).toBeNull();
  });
  it("never substitutes a tier default price", () => {
    // pricingTier is deliberately not an input: no silent 29/79 fallback.
    expect(resolvePurchaseValue({ price: undefined })).toBeNull();
  });
  it("adds only valid add-on cents", () => {
    expect(resolvePurchaseValue({ price: 29, package_addon_cents: 2400, rush_addon_cents: null }))
      .toBeCloseTo(53);
    expect(resolvePurchaseValue({ price: 29, package_addon_cents: NaN })).toBeCloseTo(29);
  });
});

describe("payment-age eligibility (bounded, not a guarantee)", () => {
  const now = Date.parse("2026-09-19T00:00:00Z");
  it("allows reporting when no confirmation time is known", () => {
    expect(isPaymentRecentEnough(undefined, now)).toBe(true);
    expect(isPaymentRecentEnough(null, now)).toBe(true);
    expect(isPaymentRecentEnough("not-a-date", now)).toBe(true);
  });
  it("allows a fresh payment", () => {
    expect(isPaymentRecentEnough(new Date(now - 60_000).toISOString(), now)).toBe(true);
  });
  it("suppresses an old receipt revisit", () => {
    const old = new Date(now - PURCHASE_REPORT_MAX_AGE_MS - 1000).toISOString();
    expect(isPaymentRecentEnough(old, now)).toBe(false);
  });
  it("tolerates clock skew into the future", () => {
    expect(isPaymentRecentEnough(new Date(now + 5 * 60_000).toISOString(), now)).toBe(true);
  });
});

describe("dedupe guards", () => {
  it("blocks a second report after a refresh in the same tab", () => {
    const stores = { session: memStore(), local: memStore() };
    expect(purchaseAlreadyReported(stores, "ord-1", "legacy")).toBe(false);
    markPurchaseReported(stores, "ord-1", "legacy");
    expect(purchaseAlreadyReported(stores, "ord-1", "legacy")).toBe(true);
  });

  it("blocks a brand-new session on the same device (durable store)", () => {
    const local = memStore();
    const first = { session: memStore(), local };
    markPurchaseReported(first, "ord-1", "legacy");
    const newSession = { session: memStore(), local }; // fresh tab, same device
    expect(purchaseAlreadyReported(newSession, "ord-1", "legacy")).toBe(true);
  });

  it("does NOT block another device — cross-device replay needs payment age", () => {
    const deviceA = { session: memStore(), local: memStore() };
    markPurchaseReported(deviceA, "ord-1", "legacy");
    const deviceB = { session: memStore(), local: memStore() };
    expect(purchaseAlreadyReported(deviceB, "ord-1", "legacy")).toBe(false);
  });

  it("honours the legacy per-tab key written before this change", () => {
    const session = memStore();
    session.setItem("psg_purchase_tracked_cs_1", "1");
    expect(purchaseAlreadyReported({ session, local: memStore() }, "ord-1", "psg_purchase_tracked_cs_1"))
      .toBe(true);
  });

  it("keeps different orders independent", () => {
    const stores = { session: memStore(), local: memStore() };
    markPurchaseReported(stores, "ord-1", "legacy-1");
    expect(purchaseAlreadyReported(stores, "ord-2", "legacy-2")).toBe(false);
  });

  it("dedupes add-ons per kind and session", () => {
    const stores = { session: memStore(), local: memStore() };
    markAddonReported(stores, "pkg", "cs_1", "psg_pkg_purchase_tracked_cs_1");
    expect(addonAlreadyReported(stores, "pkg", "cs_1", "psg_pkg_purchase_tracked_cs_1")).toBe(true);
    expect(addonAlreadyReported(stores, "rush", "cs_1", "psg_rush_purchase_tracked_cs_1")).toBe(false);
    expect(addonAlreadyReported(stores, "pkg", "cs_2", "psg_pkg_purchase_tracked_cs_2")).toBe(false);
  });

  it("survives storage throwing (private mode)", () => {
    const throwing = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("denied"); },
    };
    const stores = { session: throwing, local: throwing };
    expect(() => markPurchaseReported(stores, "ord-1", "legacy")).not.toThrow();
    expect(purchaseAlreadyReported(stores, "ord-1", "legacy")).toBe(false);
  });
});
