/**
 * Pure helpers for ad-pixel purchase reporting.
 *
 * Reporting-only: nothing in this file may influence charging, order creation,
 * entitlement state, or what the customer sees. When a value cannot be trusted
 * we suppress the *report*, never the UI.
 */

export type AddonKind = "pkg" | "rush" | "tip" | "lyrics" | "download" | "bonus";

/** Standard base-song purchase event id. Shared by browser and server. */
export function purchaseEventId(orderId: string): string {
  return `purchase_${orderId}`;
}

/** Custom add-on event id. Shared by browser and server (must match exactly). */
export function addonEventId(kind: AddonKind, sessionId: string): string {
  return `addon_${kind}_${sessionId}`;
}

/** Legacy transaction_id kept for GA/Meta parameter continuity. */
export function addonTransactionId(kind: AddonKind, sessionId: string): string {
  return `${kind}_${sessionId}`;
}

/**
 * A reportable amount must be a finite, positive number of cents.
 * Missing / NaN / 0 / negative => not reportable (no silent price fallback).
 */
export function isReportableAmountCents(cents: unknown): cents is number {
  return typeof cents === "number" && Number.isFinite(cents) && cents > 0;
}

/**
 * Resolve the dollar value for a base purchase from server-verified figures only.
 * Returns null when the verified base price is absent or not a positive finite
 * number — callers must then skip reporting entirely.
 */
export function resolvePurchaseValue(input: {
  price?: number | null;
  package_addon_cents?: number | null;
  rush_addon_cents?: number | null;
}): number | null {
  const base = input.price;
  if (typeof base !== "number" || !Number.isFinite(base) || base <= 0) return null;
  const pkg = isReportableAmountCents(input.package_addon_cents) ? input.package_addon_cents : 0;
  const rush = isReportableAmountCents(input.rush_addon_cents) ? input.rush_addon_cents : 0;
  const total = base + pkg / 100 + rush / 100;
  return Number.isFinite(total) && total > 0 ? total : null;
}

export interface ReportedPurchase {
  value: number;
  currency: string;
}

/**
 * Preferred reported amount: the total the provider actually captured, when the
 * verification response supplies it. Falls back to the server-verified
 * base + add-on figures for responses from older builds. Returns null when
 * nothing trustworthy is available (report is then suppressed, UI untouched).
 */
export function resolveReportedPurchase(input: {
  paidTotalCents?: number | null;
  paidCurrency?: string | null;
  price?: number | null;
  package_addon_cents?: number | null;
  rush_addon_cents?: number | null;
}): ReportedPurchase | null {
  const currency =
    typeof input.paidCurrency === "string" && /^[a-zA-Z]{3}$/.test(input.paidCurrency)
      ? input.paidCurrency.toUpperCase()
      : "USD";
  if (isReportableAmountCents(input.paidTotalCents)) {
    return { value: input.paidTotalCents / 100, currency };
  }
  const fallback = resolvePurchaseValue(input);
  return fallback === null ? null : { value: fallback, currency };
}

/**
 * Bounded payment-age eligibility.
 *
 * A durable per-device guard cannot stop a *different* device or browser from
 * replaying an old receipt link, so eligibility is also bounded by how long ago
 * the payment provider confirmed the payment. When no confirmation time is
 * available the caller keeps its previous behaviour (returns true) — we do not
 * silently drop genuine conversions.
 */
export const PURCHASE_REPORT_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

export function isPaymentRecentEnough(
  confirmedAt: string | number | null | undefined,
  nowMs: number = Date.now(),
  maxAgeMs: number = PURCHASE_REPORT_MAX_AGE_MS,
): boolean {
  if (confirmedAt === null || confirmedAt === undefined || confirmedAt === "") return true;
  const ms = typeof confirmedAt === "number" ? confirmedAt : Date.parse(confirmedAt);
  if (!Number.isFinite(ms)) return true;
  const age = nowMs - ms;
  if (age < 0) return true; // clock skew: never suppress a fresh payment
  return age <= maxAgeMs;
}

/**
 * Full reporting eligibility for a verification response.
 *
 * - A provider-confirmed time older than the window => suppress (this is what
 *   stops an old receipt link opened on a *different* device from re-reporting;
 *   the per-device storage guard cannot see other devices).
 * - Missing / malformed time => FAIL OPEN (report). Suppressing here would drop
 *   genuine conversions from older server builds and from $0 or provider edge
 *   cases. Documented limit, not a guarantee.
 */
export function isPaymentEligibleForReport(
  input: { paidAt?: string | number | null; paidAtSource?: string | null },
  nowMs: number = Date.now(),
  maxAgeMs: number = PURCHASE_REPORT_MAX_AGE_MS,
): boolean {
  return isPaymentRecentEnough(input.paidAt ?? null, nowMs, maxAgeMs);
}

export interface TrackingStores {
  session?: Pick<Storage, "getItem" | "setItem"> | null;
  local?: Pick<Storage, "getItem" | "setItem"> | null;
}

function safeGet(store: TrackingStores["session"], key: string): string | null {
  try {
    return store ? store.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeSet(store: TrackingStores["session"], key: string, value: string): void {
  try {
    store?.setItem(key, value);
  } catch {
    /* storage unavailable — ignore */
  }
}

/**
 * Durable + legacy dedupe for a base purchase.
 * `legacyKey` is the historical sessionStorage key (per tab); `orderKey` is the
 * durable localStorage key so a refresh or a new tab on the same device cannot
 * re-fire. Cross-device replay is handled by payment-age eligibility above.
 */
export function purchaseAlreadyReported(
  stores: TrackingStores,
  orderId: string,
  legacyKey: string,
): boolean {
  const durableKey = `psg_purchase_reported_${orderId}`;
  return (
    safeGet(stores.local, durableKey) !== null || safeGet(stores.session, legacyKey) !== null
  );
}

export function markPurchaseReported(
  stores: TrackingStores,
  orderId: string,
  legacyKey: string,
): void {
  safeSet(stores.local, `psg_purchase_reported_${orderId}`, "1");
  safeSet(stores.session, legacyKey, "1");
}

export function addonAlreadyReported(
  stores: TrackingStores,
  kind: AddonKind,
  sessionId: string,
  legacyKey: string,
): boolean {
  const durableKey = `psg_addon_reported_${kind}_${sessionId}`;
  return (
    safeGet(stores.local, durableKey) !== null || safeGet(stores.session, legacyKey) !== null
  );
}

export function markAddonReported(
  stores: TrackingStores,
  kind: AddonKind,
  sessionId: string,
  legacyKey: string,
): void {
  safeSet(stores.local, `psg_addon_reported_${kind}_${sessionId}`, "1");
  safeSet(stores.session, legacyKey, "1");
}

export function browserStores(): TrackingStores {
  if (typeof window === "undefined") return { session: null, local: null };
  let session: TrackingStores["session"] = null;
  let local: TrackingStores["local"] = null;
  try { session = window.sessionStorage; } catch { session = null; }
  try { local = window.localStorage; } catch { local = null; }
  return { session, local };
}
