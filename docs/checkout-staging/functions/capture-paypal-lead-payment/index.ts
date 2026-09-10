/**
 * STAGED DRAFT — INERT.
 * At launch: supabase/functions/capture-paypal-lead-payment/index.ts
 *
 * Browser-facing capture. Deliberately NOT gated on the creation flag: a
 * rollback must never orphan a payment a buyer already approved.
 */

import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { customerMessageFor } from "../../shared/lead-paypal-core.ts";
import { finalizeLeadPayPalAttempt, type AttemptRow } from "../_shared/lead-paypal-finalize.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PAYPAL_API = "https://api-m.paypal.com";

async function getAccessToken(): Promise<string> {
  const auth = btoa(`${Deno.env.get("PAYPAL_CLIENT_ID")}:${Deno.env.get("PAYPAL_SECRET_KEY")}`);
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error("PayPal auth failed");
  return (await res.json()).access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { attemptId, returnSecret } = await req.json();
    if (typeof attemptId !== "string" || typeof returnSecret !== "string") {
      return json({ error: "invalid_request" }, 400);
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: attempt } = await supabase
      .from("paypal_lead_attempts")
      .select("id, lead_id, provider_order_id, provider_capture_id, base_cents, package_cents, total_cents, status, return_secret_hash, finalized_order_id")
      .eq("id", attemptId)
      .maybeSingle();
    if (!attempt) return json({ error: "attempt_not_found" }, 404);

    // Already done: replay-safe, no second capture attempt.
    if (attempt.status === "finalized" && attempt.finalized_order_id) {
      return json({ state: "finalized", orderId: attempt.finalized_order_id, shortId: String(attempt.finalized_order_id).slice(0, 8) }, 200);
    }

    const result = await finalizeLeadPayPalAttempt(supabase, attempt as AttemptRow, {
      presentedSecret: returnSecret,
      requireSecret: true,
      accessToken: await getAccessToken(),
      payeeMerchantId: Deno.env.get("PAYPAL_PAYEE_MERCHANT_ID") ?? null,
    });

    // One-time use of the return secret, only after a real decision was reached.
    if (result.kind !== "pending") {
      await supabase.from("paypal_lead_attempts")
        .update({ return_secret_used_at: new Date().toISOString() })
        .eq("id", attemptId)
        .is("return_secret_used_at", null);
    }

    switch (result.kind) {
      case "finalized":
      case "already":
        return json({ state: "finalized", orderId: result.orderId, shortId: result.orderId.slice(0, 8) }, 200);
      case "duplicate":
        // The buyer's song is the canonical order; the extra payment is logged
        // for a human. No refund is attempted here.
        return json({
          state: "finalized",
          orderId: result.orderId,
          shortId: result.orderId ? result.orderId.slice(0, 8) : null,
          duplicateRecorded: true,
        }, 200);
      case "declined":
        return json({ state: "declined", ...customerMessageFor("declined") }, 402);
      case "pending":
        return json({ state: "pending", ...customerMessageFor(result.outcome) }, 202);
      case "incident":
      default:
        return json({ state: "pending", reason: result.reason, ...customerMessageFor("uncertain") }, 202);
    }
  } catch (e) {
    console.error("[LEAD-PAYPAL] capture error", e);
    // Unknown state: never tell the buyer they were not charged.
    return json({ state: "pending", ...customerMessageFor("uncertain") }, 202);
  }
});
