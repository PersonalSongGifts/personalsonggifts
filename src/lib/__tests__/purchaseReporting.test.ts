import { describe, it, expect } from "vitest";
import {
  isPaymentEligibleForReport,
  markPurchaseReported,
  purchaseAlreadyReported,
  resolveReportedPurchase,
  PURCHASE_REPORT_MAX_AGE_MS,
} from "../purchaseTracking";

function memStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, v); },
  };
}

const NOW = Date.parse("2026-09-19T12:00:00Z");
const fresh = new Date(NOW - 2 * 60_000).toISOString();
const stale = new Date(NOW - PURCHASE_REPORT_MAX_AGE_MS - 60_000).toISOString();

describe("reported amount prefers the provider-captured total", () => {
  it("uses paidTotalCents when present", () => {
    expect(resolveReportedPurchase({ paidTotalCents: 5300, price: 29 }))
      .toEqual({ value: 53, currency: "USD" });
  });
  it("carries the captured currency", () => {
    expect(resolveReportedPurchase({ paidTotalCents: 2900, paidCurrency: "cad" }))
      .toEqual({ value: 29, currency: "CAD" });
  });
  it("ignores a malformed currency and keeps USD", () => {
    expect(resolveReportedPurchase({ paidTotalCents: 2900, paidCurrency: "dollars" }))
      .toEqual({ value: 29, currency: "USD" });
  });
  it("falls back to server-verified figures for older responses", () => {
    expect(resolveReportedPurchase({ price: 29, package_addon_cents: 2400 }))
      .toEqual({ value: 53, currency: "USD" });
  });
  it("suppresses a free-code / zero capture", () => {
    expect(resolveReportedPurchase({ paidTotalCents: 0, price: 0 })).toBeNull();
  });
  it("suppresses when nothing trustworthy is available", () => {
    expect(resolveReportedPurchase({})).toBeNull();
    expect(resolveReportedPurchase({ paidTotalCents: NaN })).toBeNull();
  });
});

describe("cross-device stale receipt protection", () => {
  it("reports a current Stripe/PayPal payment", () => {
    expect(isPaymentEligibleForReport({ paidAt: fresh, paidAtSource: "provider" }, NOW)).toBe(true);
  });

  it("does NOT report an old receipt opened on a brand-new device", () => {
    const deviceB = { session: memStore(), local: memStore() }; // nothing stored here
    expect(purchaseAlreadyReported(deviceB, "ord-1", "legacy")).toBe(false);
    expect(isPaymentEligibleForReport({ paidAt: stale, paidAtSource: "provider" }, NOW)).toBe(false);
  });

  it("reports a delayed settlement inside the window", () => {
    const delayed = new Date(NOW - 5 * 60 * 60 * 1000).toISOString();
    expect(isPaymentEligibleForReport({ paidAt: delayed, paidAtSource: "provider" }, NOW)).toBe(true);
  });

  it("fails open on a missing or malformed timestamp (documented limit)", () => {
    expect(isPaymentEligibleForReport({ paidAtSource: "unavailable" }, NOW)).toBe(true);
    expect(isPaymentEligibleForReport({ paidAt: "yesterday", paidAtSource: "provider" }, NOW)).toBe(true);
    expect(isPaymentEligibleForReport({ paidAt: null }, NOW)).toBe(true);
  });

  it("still blocks a refresh / second tab on the paying device", () => {
    const local = memStore();
    markPurchaseReported({ session: memStore(), local }, "ord-1", "legacy");
    expect(purchaseAlreadyReported({ session: memStore(), local }, "ord-1", "legacy")).toBe(true);
  });

  it("never throws when storage is unavailable", () => {
    const throwing = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("denied"); },
    };
    expect(() => markPurchaseReported({ session: throwing, local: throwing }, "o", "l")).not.toThrow();
    expect(isPaymentEligibleForReport({ paidAt: fresh }, NOW)).toBe(true);
  });
});
