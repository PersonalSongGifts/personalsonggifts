/**
 * STAGED DRAFT — INERT.
 *
 * The single finalizer used by every rail: browser-triggered capture,
 * reconciliation, and (once adopted) verified provider webhooks. It performs
 * no customer messaging, no generation, and no refunds.
 */

import {
  buildPayPalRequestId,
  classifyCaptureFailure,
  extractCaptureFacts,
  PAYPAL_LEAD_NOTES_PREFIX,
  returnSecretMatches,
  verifyCapture,
  type CaptureOutcome,
} from "../../shared/lead-paypal-core.ts";

const PAYPAL_API = "https://api-m.paypal.com";

export interface AttemptRow {
  id: string;
  lead_id: string;
  provider_order_id: string | null;
  provider_capture_id: string | null;
  base_cents: number;
  package_cents: number;
  total_cents: number;
  status: string;
  return_secret_hash: string;
}

export type FinalizeResult =
  | { kind: "finalized"; orderId: string }
  | { kind: "already"; orderId: string }
  | { kind: "duplicate"; orderId: string | null; incidentId: string }
  | { kind: "incident"; reason: string; incidentId?: string }
  | { kind: "pending"; outcome: CaptureOutcome }
  | { kind: "declined" };

/**
 * @param presentedSecret required for browser-initiated calls; pass null for
 *   reconciliation and webhooks, which authenticate by service key/signature.
 */
export async function finalizeLeadPayPalAttempt(
  supabase: any,
  attempt: AttemptRow,
  opts: { presentedSecret?: string | null; requireSecret: boolean; accessToken: string; payeeMerchantId: string | null },
): Promise<FinalizeResult> {
  if (opts.requireSecret) {
    const ok = await returnSecretMatches(opts.presentedSecret ?? null, attempt.return_secret_hash);
    if (!ok) return { kind: "incident", reason: "return_secret_invalid" };
  }
  if (!attempt.provider_order_id) return { kind: "incident", reason: "provider_order_missing" };

  const requestId = buildPayPalRequestId(attempt.id);

  // 1. Capture. The stable PayPal-Request-Id makes replays safe at the provider.
  let httpStatus: number | null = null;
  let rawBody: string | null = null;
  let body: unknown = null;
  try {
    const res = await fetch(`${PAYPAL_API}/v2/checkout/orders/${attempt.provider_order_id}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": requestId,
      },
    });
    httpStatus = res.status;
    rawBody = await res.text();
    if (res.ok) body = JSON.parse(rawBody);
  } catch (e) {
    httpStatus = null;
    rawBody = e instanceof Error ? e.message : String(e);
  }

  // 2. Non-OK: classify. Only INSTRUMENT_DECLINED may be reported as "not charged".
  if (!body) {
    const outcome = classifyCaptureFailure(httpStatus, rawBody);
    if (outcome === "declined") {
      await supabase.from("paypal_lead_attempts")
        .update({ status: "failed", last_error: "INSTRUMENT_DECLINED", updated_at: new Date().toISOString() })
        .eq("id", attempt.id);
      return { kind: "declined" };
    }
    if (outcome === "already_captured") {
      const res = await fetch(`${PAYPAL_API}/v2/checkout/orders/${attempt.provider_order_id}`, {
        headers: { Authorization: `Bearer ${opts.accessToken}` },
      });
      if (!res.ok) return { kind: "pending", outcome: "uncertain" };
      body = await res.json();
    } else {
      await supabase.from("payment_incidents").insert({
        kind: "uncertain_capture",
        provider: "paypal",
        provider_order_id: attempt.provider_order_id,
        lead_id: attempt.lead_id,
        attempt_id: attempt.id,
        detail: `${outcome}: ${String(rawBody).slice(0, 400)}`,
      });
      return { kind: "pending", outcome };
    }
  }

  // 3. Strict verification. A mismatch is an incident and unlocks nothing.
  const facts = extractCaptureFacts(body);
  const verdict = verifyCapture(facts, {
    providerOrderId: attempt.provider_order_id,
    totalCents: attempt.total_cents,
    payeeMerchantId: opts.payeeMerchantId,
  });
  if (!verdict.ok) {
    const { data: incident } = await supabase.from("payment_incidents").insert({
      kind: verdict.reason === "amount_mismatch" ? "amount_mismatch"
        : verdict.reason === "currency_mismatch" ? "currency_mismatch"
        : verdict.reason === "payee_mismatch" ? "payee_mismatch"
        : "status_unexpected",
      provider: "paypal",
      provider_order_id: attempt.provider_order_id,
      provider_capture_id: facts.captureId,
      lead_id: attempt.lead_id,
      attempt_id: attempt.id,
      amount_cents: facts.amountValue ? undefined : undefined,
      currency: facts.currencyCode,
      detail: `${verdict.reason}: ${verdict.detail}`,
    }).select("id").maybeSingle();
    await supabase.from("paypal_lead_attempts")
      .update({ status: "incident", incident_reason: verdict.reason, updated_at: new Date().toISOString() })
      .eq("id", attempt.id);
    return { kind: "incident", reason: verdict.reason, incidentId: incident?.id };
  }

  await supabase.from("paypal_lead_attempts")
    .update({
      status: "captured",
      provider_capture_id: verdict.captureId,
      captured_amount_cents: verdict.amountCents,
      captured_currency: "USD",
      updated_at: new Date().toISOString(),
    })
    .eq("id", attempt.id);

  // 4. Atomic finalisation in the database.
  const notesKey = `${PAYPAL_LEAD_NOTES_PREFIX}${attempt.provider_order_id}`;
  const { data, error } = await supabase.rpc("finalize_lead_payment", {
    p_provider: "paypal",
    p_provider_order_id: attempt.provider_order_id,
    p_provider_capture_id: verdict.captureId,
    p_attempt_id: attempt.id,
    p_lead_id: attempt.lead_id,
    p_base_cents: attempt.base_cents,
    p_package_cents: attempt.package_cents,
    p_captured_cents: verdict.amountCents,
    p_currency: "USD",
    p_notes_key: notesKey,
  });

  if (error) {
    await supabase.from("payment_incidents").insert({
      kind: "finalize_failed",
      provider: "paypal",
      provider_order_id: attempt.provider_order_id,
      provider_capture_id: verdict.captureId,
      lead_id: attempt.lead_id,
      attempt_id: attempt.id,
      amount_cents: verdict.amountCents,
      currency: "USD",
      detail: String(error.message ?? error).slice(0, 400),
    });
    // Money is captured and the attempt row is durable, so reconciliation will
    // retry. Never report success, never report "not charged".
    return { kind: "pending", outcome: "uncertain" };
  }

  const outcome = (data ?? {}) as Record<string, string>;
  if (outcome.outcome === "finalized") return { kind: "finalized", orderId: outcome.order_id };
  if (outcome.outcome === "already") return { kind: "already", orderId: outcome.order_id };
  if (outcome.outcome === "duplicate") {
    return { kind: "duplicate", orderId: outcome.order_id ?? null, incidentId: outcome.incident_id };
  }
  return { kind: "incident", reason: outcome.reason ?? "unknown", incidentId: outcome.incident_id };
}
