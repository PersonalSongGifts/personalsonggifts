/**
 * STAGED DRAFT — NOT WIRED INTO THE APP.
 *
 * Pure, dependency-free core for the existing-song (lead preview) PayPal rail.
 * No network, no database, no Deno/Node globals other than Web Crypto, so every
 * rule below is unit-testable offline.
 *
 * At launch this file would move to supabase/functions/_shared/lead-paypal.ts.
 * Nothing here decides price policy: the base/package amounts are produced by
 * the EXISTING server pricing logic in create-lead-checkout and handed in.
 */

export const PAYPAL_LEAD_NOTES_PREFIX = "paypal_lead:";
export const EXPECTED_CURRENCY = "USD";

/** Immutable server quote, persisted before any approval URL is handed out. */
export interface LeadQuoteSnapshot {
  leadId: string;
  previewToken: string;
  /** Base song price in cents, produced by existing server pricing. */
  baseCents: number;
  /** Forever Memory package in cents, 0 when not purchased. */
  packageCents: number;
  totalCents: number;
  currency: "USD";
  hasForeverMemory: boolean;
  /** Snapshot of the assets that must exist for this sale to be fulfillable. */
  assets: LeadAssetSnapshot;
  /** Pricing inputs echoed for audit; never re-read from the client. */
  offerFlags: {
    followup: boolean;
    vday10: boolean;
    promoSlug: string | null;
  };
}

export interface LeadAssetSnapshot {
  fullSongUrl: string | null;
  bonusSongUrl: string | null;
  coverImageUrl: string | null;
  songTitle: string | null;
}

export class QuoteError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "QuoteError";
  }
}

function isNonNegativeInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

/**
 * Freeze a server quote. Rejects anything that could become a fulfilment debt:
 * a missing primary song, or a package sale with no existing second version.
 */
export function buildLeadQuoteSnapshot(input: {
  leadId: string;
  previewToken: string;
  baseCents: number;
  packageCents: number;
  hasForeverMemory: boolean;
  assets: LeadAssetSnapshot;
  offerFlags: LeadQuoteSnapshot["offerFlags"];
}): LeadQuoteSnapshot {
  if (!input.leadId) throw new QuoteError("lead_missing", "Lead id is required");
  if (!input.previewToken || input.previewToken.length < 16) {
    throw new QuoteError("token_invalid", "Preview token is invalid");
  }
  if (!isNonNegativeInt(input.baseCents) || !isNonNegativeInt(input.packageCents)) {
    throw new QuoteError("amount_invalid", "Amounts must be non-negative integer cents");
  }
  if (input.hasForeverMemory !== input.packageCents > 0) {
    throw new QuoteError("package_mismatch", "Package flag and package amount disagree");
  }
  if (!input.assets.fullSongUrl) {
    throw new QuoteError("song_not_ready", "The finished song does not exist yet");
  }
  if (input.hasForeverMemory && !input.assets.bonusSongUrl) {
    throw new QuoteError("package_not_ready", "The second version does not exist yet");
  }
  const totalCents = input.baseCents + input.packageCents;
  if (totalCents <= 0) {
    throw new QuoteError("zero_total", "PayPal cannot process a zero-value order");
  }
  return {
    leadId: input.leadId,
    previewToken: input.previewToken,
    baseCents: input.baseCents,
    packageCents: input.packageCents,
    totalCents,
    currency: EXPECTED_CURRENCY,
    hasForeverMemory: input.hasForeverMemory,
    assets: { ...input.assets },
    offerFlags: { ...input.offerFlags },
  };
}

export function quoteToPayPalAmount(quote: LeadQuoteSnapshot): { currency_code: "USD"; value: string } {
  return { currency_code: EXPECTED_CURRENCY, value: (quote.totalCents / 100).toFixed(2) };
}

/* ------------------------------------------------------------------ *
 * Return secret: random, returned once, stored only as a SHA-256 hash
 * ------------------------------------------------------------------ */

export function generateReturnSecret(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashReturnSecret(secret: string): Promise<string> {
  const data = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison of two equal-length hex digests. */
export function timingSafeHexEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function returnSecretMatches(presented: string | null | undefined, storedHash: string | null | undefined): Promise<boolean> {
  if (!presented || !storedHash) return false;
  return timingSafeHexEqual(await hashReturnSecret(presented), storedHash);
}

/**
 * Stable idempotency key for the PayPal capture call. Derived from the attempt
 * id only, so every retry — browser, reconciliation, webhook — sends the same
 * PayPal-Request-Id and PayPal itself collapses duplicates.
 */
export function buildPayPalRequestId(attemptId: string): string {
  if (!attemptId) throw new QuoteError("attempt_missing", "Attempt id is required");
  return `psg-lead-capture-${attemptId}`;
}

/* ------------------------------------------------------------------ *
 * Capture verification — strict, and never optimistic
 * ------------------------------------------------------------------ */

export interface CaptureFacts {
  providerOrderId: string | null;
  status: string | null;
  amountValue: string | null;
  currencyCode: string | null;
  payeeMerchantId: string | null;
  captureId: string | null;
}

export type CaptureVerdict =
  | { ok: true; amountCents: number; captureId: string }
  | { ok: false; reason: CaptureRejectReason; detail: string };

export type CaptureRejectReason =
  | "order_mismatch"
  | "status_not_completed"
  | "currency_mismatch"
  | "amount_mismatch"
  | "payee_mismatch"
  | "capture_id_missing"
  | "amount_unparseable";

export function parseAmountToCents(value: string | null | undefined): number | null {
  if (typeof value !== "string" || !/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
  const cents = Math.round(parseFloat(value.trim()) * 100);
  return Number.isInteger(cents) && cents >= 0 ? cents : null;
}

/**
 * Every clause must pass. A failure is an incident to be recorded, never a
 * reason to unlock the song. `expectedPayeeMerchantId` is optional only so a
 * draft can run before the merchant id is decided; launch requires it.
 */
export function verifyCapture(
  facts: CaptureFacts,
  expected: { providerOrderId: string; totalCents: number; payeeMerchantId?: string | null },
): CaptureVerdict {
  if (!facts.providerOrderId || facts.providerOrderId !== expected.providerOrderId) {
    return { ok: false, reason: "order_mismatch", detail: `provider order ${facts.providerOrderId} != ${expected.providerOrderId}` };
  }
  if (facts.status !== "COMPLETED") {
    return { ok: false, reason: "status_not_completed", detail: `status ${facts.status}` };
  }
  if (facts.currencyCode !== EXPECTED_CURRENCY) {
    return { ok: false, reason: "currency_mismatch", detail: `currency ${facts.currencyCode}` };
  }
  const amountCents = parseAmountToCents(facts.amountValue);
  if (amountCents === null) {
    return { ok: false, reason: "amount_unparseable", detail: `amount ${facts.amountValue}` };
  }
  if (amountCents !== expected.totalCents) {
    return { ok: false, reason: "amount_mismatch", detail: `captured ${amountCents} != quoted ${expected.totalCents}` };
  }
  if (expected.payeeMerchantId && facts.payeeMerchantId !== expected.payeeMerchantId) {
    return { ok: false, reason: "payee_mismatch", detail: `payee ${facts.payeeMerchantId}` };
  }
  if (!facts.captureId) {
    return { ok: false, reason: "capture_id_missing", detail: "no capture id on the payment" };
  }
  return { ok: true, amountCents, captureId: facts.captureId };
}

/** Extract the facts we verify from a PayPal order/capture response body. */
export function extractCaptureFacts(body: unknown): CaptureFacts {
  const b = (body ?? {}) as Record<string, any>;
  const unit = Array.isArray(b.purchase_units) ? b.purchase_units[0] : undefined;
  const capture = unit?.payments?.captures?.[0];
  return {
    providerOrderId: typeof b.id === "string" ? b.id : null,
    status: typeof capture?.status === "string" ? capture.status : (typeof b.status === "string" ? b.status : null),
    amountValue: typeof capture?.amount?.value === "string" ? capture.amount.value : null,
    currencyCode: typeof capture?.amount?.currency_code === "string" ? capture.amount.currency_code : null,
    payeeMerchantId: typeof unit?.payee?.merchant_id === "string" ? unit.payee.merchant_id : null,
    captureId: typeof capture?.id === "string" ? capture.id : null,
  };
}

/* ------------------------------------------------------------------ *
 * Capture-failure classification
 * ------------------------------------------------------------------ */

export type CaptureOutcome =
  | "already_captured"   // money taken; recover, do not restart
  | "declined"           // buyer NOT charged; safe to retry or switch rail
  | "order_not_found"    // provider has no such order
  | "not_approved"       // buyer has not approved yet
  | "uncertain";         // unknown/network — money state unknown, never claim "not charged"

export function classifyCaptureFailure(httpStatus: number | null, rawBody: string | null): CaptureOutcome {
  const body = (rawBody || "").toUpperCase();
  if (body.includes("ORDER_ALREADY_CAPTURED")) return "already_captured";
  if (body.includes("INSTRUMENT_DECLINED") || body.includes("PAYER_ACTION_REQUIRED") && false) return "declined";
  if (body.includes("INSTRUMENT_DECLINED")) return "declined";
  if (body.includes("RESOURCE_NOT_FOUND") || body.includes("INVALID_RESOURCE_ID")) return "order_not_found";
  if (body.includes("ORDER_NOT_APPROVED") || body.includes("PAYER_ACTION_REQUIRED")) return "not_approved";
  if (httpStatus === null) return "uncertain";
  if (httpStatus >= 500) return "uncertain";
  return "uncertain";
}

/** Customer-facing copy. "uncertain" must never claim the buyer was not charged. */
export function customerMessageFor(outcome: CaptureOutcome): { title: string; body: string } {
  switch (outcome) {
    case "declined":
      return {
        title: "That payment method was declined",
        body: "No payment was taken. You can try again or use a card instead.",
      };
    case "not_approved":
      return {
        title: "Payment not finished",
        body: "It looks like the payment wasn't completed. You can start again from your song page.",
      };
    case "order_not_found":
      return {
        title: "We couldn't find that payment",
        body: "Please start again from your song page. If you believe you were charged, reply to your email and we'll check.",
      };
    case "already_captured":
    case "uncertain":
    default:
      return {
        title: "We're confirming your payment",
        body: "We're checking with the payment provider. If it went through, your song will unlock automatically and you'll get an email — you don't need to pay again. If anything looks wrong, reply to your email and a person will sort it out.",
      };
  }
}

/* ------------------------------------------------------------------ *
 * Launch gating
 * ------------------------------------------------------------------ */

export interface LaunchReadiness {
  creationFlagEnabled: boolean;
  attemptTableReady: boolean;
  payeeMerchantIdConfigured: boolean;
}

/** Creation is refused unless every readiness condition holds. */
export function canCreateLeadPayPalOrder(r: LaunchReadiness): { allowed: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (!r.creationFlagEnabled) blockers.push("lead_paypal_creation_enabled is not true");
  if (!r.attemptTableReady) blockers.push("paypal_lead_attempts table is not present");
  if (!r.payeeMerchantIdConfigured) blockers.push("PAYPAL_PAYEE_MERCHANT_ID is not configured");
  return { allowed: blockers.length === 0, blockers };
}

/**
 * Capture and reconciliation are deliberately NOT gated on the creation flag:
 * turning creation off during a rollback must never orphan a payment that has
 * already been approved by a buyer.
 */
export function canFinalizeExistingAttempt(_r: LaunchReadiness): boolean {
  return true;
}
