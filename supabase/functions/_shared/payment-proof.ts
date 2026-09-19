/**
 * Provider-confirmed payment proof for REPORTING ONLY.
 *
 * Rules (do not relax):
 *  - The only acceptable "paid at" is a timestamp the payment provider itself
 *    stamped on the money movement: the Stripe charge's `created`, or the PayPal
 *    capture's `create_time`. NEVER the checkout-session creation time, NEVER the
 *    local order's created_at, NEVER "now" at verification time.
 *  - Nothing here may affect charging, capture, order creation, entitlements or
 *    what the customer sees. Every helper fails soft and returns nulls.
 *  - `source` tells the browser whether this response came from a build that
 *    knows how to look the timestamp up ("provider" / "unavailable"), so a stale
 *    receipt can be distinguished from an old deploy that never sent the field.
 */

export interface PaymentProof {
  /** ISO 8601 provider-confirmed payment time, or null when not determinable. */
  paidAt: string | null;
  paidAtSource: "provider" | "unavailable";
  /** Amount actually captured, in minor units, or null. */
  paidTotalCents: number | null;
  /** ISO currency of the captured amount (upper-case), or null. */
  paidCurrency: string | null;
}

export const UNAVAILABLE_PROOF: PaymentProof = {
  paidAt: null,
  paidAtSource: "unavailable",
  paidTotalCents: null,
  paidCurrency: null,
};

function isoFromUnixSeconds(seconds: unknown): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
  const d = new Date(seconds * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeIso(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function normalizeCents(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}

function normalizeCurrency(value: unknown): string | null {
  return typeof value === "string" && /^[a-zA-Z]{3}$/.test(value) ? value.toUpperCase() : null;
}

/**
 * Expand list required on every `checkout.sessions.retrieve` that needs proof.
 * The charge is the only object on the Stripe side carrying a real settlement
 * timestamp; the session and the PaymentIntent do not.
 */
export const STRIPE_PAYMENT_PROOF_EXPAND = ["payment_intent.latest_charge"];

/* eslint-disable @typescript-eslint/no-explicit-any */
export function stripePaymentProof(session: any): PaymentProof {
  try {
    const pi = session?.payment_intent;
    const charge = pi && typeof pi === "object" ? pi.latest_charge : null;
    const paidAt = charge && typeof charge === "object"
      ? isoFromUnixSeconds(charge.created)
      : null;
    return {
      paidAt,
      paidAtSource: "provider",
      paidTotalCents: normalizeCents(session?.amount_total),
      paidCurrency: normalizeCurrency(session?.currency),
    };
  } catch {
    return UNAVAILABLE_PROOF;
  }
}

/** Reads the first COMPLETED capture out of a PayPal capture or order-details body. */
export function paypalPaymentProof(body: any): PaymentProof {
  try {
    const units = body?.purchase_units;
    const captures = Array.isArray(units) ? units[0]?.payments?.captures : null;
    const capture = Array.isArray(captures)
      ? (captures.find((c: any) => c?.status === "COMPLETED") ?? captures[0])
      : null;
    if (!capture) return UNAVAILABLE_PROOF;
    const amount = capture.amount;
    const major = typeof amount?.value === "string" ? Number(amount.value) : NaN;
    return {
      paidAt: normalizeIso(capture.create_time),
      paidAtSource: "provider",
      paidTotalCents: Number.isFinite(major) ? Math.round(major * 100) : null,
      paidCurrency: normalizeCurrency(amount?.currency_code),
    };
  } catch {
    return UNAVAILABLE_PROOF;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * event_time for Meta CAPI. Uses the provider-confirmed payment time so a
 * webhook retry (or a replayed verification) reports the SAME event_time and
 * Meta can deduplicate against the original.
 */
export function capiEventTimeSeconds(
  paidAt: string | null | undefined,
  fallbackSeconds?: number,
): number | undefined {
  const iso = normalizeIso(paidAt ?? null);
  if (iso) return Math.floor(Date.parse(iso) / 1000);
  return typeof fallbackSeconds === "number" && Number.isFinite(fallbackSeconds) && fallbackSeconds > 0
    ? Math.floor(fallbackSeconds)
    : undefined;
}
