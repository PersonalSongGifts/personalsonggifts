/**
 * STAGED DRAFT — INERT. Lives under docs/ and is not deployed.
 * At launch this becomes supabase/functions/create-paypal-lead-order/index.ts.
 *
 * Creates a PayPal order for an EXISTING song (lead preview purchase).
 * Refuses unless the launch flag AND schema readiness AND payee config all hold.
 *
 * Invariants:
 *  - price policy is NOT re-implemented here; the base/package amounts come from
 *    the same server pricing the Stripe lead rail uses (REVIEW marker below).
 *  - the immutable quote + hashed return secret are persisted BEFORE the
 *    approval URL is returned, and the write fails closed.
 */

import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import {
  buildLeadQuoteSnapshot,
  canCreateLeadPayPalOrder,
  generateReturnSecret,
  hashReturnSecret,
  quoteToPayPalAmount,
  QuoteError,
} from "../../shared/lead-paypal-core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PAYPAL_API = "https://api-m.paypal.com";
const CANONICAL_SITE = "https://www.personalsonggifts.com";
const ALLOWED_ORIGINS = new Set([
  CANONICAL_SITE,
  "https://personalsonggifts.lovable.app",
]);

function resolveOrigin(raw: string | null): string {
  if (!raw) return CANONICAL_SITE;
  return ALLOWED_ORIGINS.has(raw) ? raw : CANONICAL_SITE;
}

async function getAccessToken(): Promise<string> {
  const auth = btoa(`${Deno.env.get("PAYPAL_CLIENT_ID")}:${Deno.env.get("PAYPAL_SECRET_KEY")}`);
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);
  return (await res.json()).access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { previewToken, applyFollowupDiscount, applyVday10Discount, promoSlug, addons } = await req.json();
    if (addons?.rush === true) {
      return json({ error: "Priority delivery is not available on an instant-access purchase." }, 400);
    }
    if (typeof previewToken !== "string" || previewToken.length < 16) {
      return json({ error: "Invalid preview token" }, 400);
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ---- launch gating -------------------------------------------------
    const { data: flagRow } = await supabase.from("admin_settings")
      .select("value").eq("key", "lead_paypal_creation_enabled").maybeSingle();
    const { error: tableProbe } = await supabase.from("paypal_lead_attempts").select("id").limit(1);
    const readiness = {
      creationFlagEnabled: (flagRow as { value?: string } | null)?.value === "true",
      attemptTableReady: !tableProbe,
      payeeMerchantIdConfigured: !!Deno.env.get("PAYPAL_PAYEE_MERCHANT_ID"),
    };
    const gate = canCreateLeadPayPalOrder(readiness);
    if (!gate.allowed) {
      console.log("[LEAD-PAYPAL] creation refused:", gate.blockers.join("; "));
      return json({ error: "paypal_unavailable" }, 503);
    }

    // ---- lead + server pricing ----------------------------------------
    const { data: lead } = await supabase.from("leads")
      .select("id, email, status, full_song_url, bonus_song_url, cover_image_url, song_title")
      .eq("preview_token", previewToken).maybeSingle();
    if (!lead) return json({ error: "Preview not found" }, 404);
    if (lead.status === "converted") return json({ error: "Already purchased" }, 410);

    // REVIEW / BLOCKER: this must call the SAME server pricing resolver the
    // Stripe lead rail uses. At launch, extract the pricing block of
    // create-lead-checkout into _shared/lead-checkout.ts as
    // `resolveLeadOfferCents(supabase, lead, flags)` and call it here. No
    // pricing rule is duplicated or changed in this draft.
    const offer = await resolveLeadOfferCents(supabase, lead, {
      followup: applyFollowupDiscount === true,
      vday10: applyVday10Discount === true,
      promoSlug: typeof promoSlug === "string" ? promoSlug : null,
    });
    if (!offer.ok) return json({ error: offer.error }, offer.status);

    let quote;
    try {
      quote = buildLeadQuoteSnapshot({
        leadId: lead.id,
        previewToken,
        baseCents: offer.baseCents,
        packageCents: addons?.forever_memory === true ? offer.packageCents : 0,
        hasForeverMemory: addons?.forever_memory === true,
        assets: {
          fullSongUrl: lead.full_song_url,
          bonusSongUrl: lead.bonus_song_url,
          coverImageUrl: lead.cover_image_url,
          songTitle: lead.song_title,
        },
        offerFlags: {
          followup: applyFollowupDiscount === true,
          vday10: applyVday10Discount === true,
          promoSlug: offer.promoSlug,
        },
      });
    } catch (e) {
      if (e instanceof QuoteError) return json({ error: e.code }, 409);
      throw e;
    }

    // ---- persist the attempt BEFORE any approval URL exists -----------
    const returnSecret = generateReturnSecret();
    const { data: attempt, error: attemptError } = await supabase
      .from("paypal_lead_attempts")
      .insert({
        lead_id: quote.leadId,
        preview_token: quote.previewToken,
        base_cents: quote.baseCents,
        package_cents: quote.packageCents,
        total_cents: quote.totalCents,
        currency: quote.currency,
        has_forever_memory: quote.hasForeverMemory,
        asset_snapshot: quote.assets,
        offer_flags: quote.offerFlags,
        return_secret_hash: await hashReturnSecret(returnSecret),
        status: "quoted",
      })
      .select("id")
      .single();

    // Fail closed: no attempt row, no PayPal order.
    if (attemptError || !attempt) {
      console.error("[LEAD-PAYPAL] attempt write failed; refusing to create order", attemptError);
      return json({ error: "checkout_unavailable" }, 503);
    }

    const origin = resolveOrigin(req.headers.get("origin"));
    const returnUrl = new URL(`${origin}/payment-success`);
    returnUrl.searchParams.set("source", "lead-paypal");
    returnUrl.searchParams.set("attempt", attempt.id);
    returnUrl.searchParams.set("rs", returnSecret);
    const cancelUrl = new URL(`${origin}/preview/${quote.previewToken}`);
    if (quote.offerFlags.followup) cancelUrl.searchParams.set("followup", "true");
    if (quote.offerFlags.vday10) cancelUrl.searchParams.set("vday10", "true");
    if (quote.offerFlags.promoSlug) cancelUrl.searchParams.set("promo", quote.offerFlags.promoSlug);

    const accessToken = await getAccessToken();
    const createRes = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        // Stable per attempt, so a retried create cannot mint a second order.
        "PayPal-Request-Id": `psg-lead-create-${attempt.id}`,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          custom_id: attempt.id,
          amount: quoteToPayPalAmount(quote),
          payee: { merchant_id: Deno.env.get("PAYPAL_PAYEE_MERCHANT_ID") },
          description: quote.hasForeverMemory ? "Your song + Forever Memory Package" : "Your song",
        }],
        application_context: {
          brand_name: "Personal Song Gifts",
          user_action: "PAY_NOW",
          return_url: returnUrl.toString(),
          cancel_url: cancelUrl.toString(),
        },
      }),
    });

    if (!createRes.ok) {
      const detail = await createRes.text();
      await supabase.from("paypal_lead_attempts")
        .update({ status: "failed", last_error: detail.slice(0, 500), updated_at: new Date().toISOString() })
        .eq("id", attempt.id);
      console.error("[LEAD-PAYPAL] create failed", detail);
      return json({ error: "checkout_unavailable" }, 502);
    }

    const paypalOrder = await createRes.json();

    // Bind the provider order id to the attempt. Unique index makes this the
    // single duplicate guard; a conflict means a retry raced us.
    const { error: bindError } = await supabase.from("paypal_lead_attempts")
      .update({
        provider_order_id: paypalOrder.id,
        status: "approval_pending",
        attempt_count: 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", attempt.id);
    if (bindError) {
      console.error("[LEAD-PAYPAL] could not bind provider order id", bindError);
      return json({ error: "checkout_unavailable" }, 503);
    }

    return json({
      orderID: paypalOrder.id,
      attemptId: attempt.id,
      totalCents: quote.totalCents,
      packageCents: quote.packageCents,
    }, 200);
  } catch (e) {
    console.error("[LEAD-PAYPAL] create error", e);
    return json({ error: "checkout_unavailable" }, 500);
  }
});

// Placeholder for the extraction described above. Intentionally not implemented
// in the draft so no pricing rule is invented here.
declare function resolveLeadOfferCents(
  supabase: unknown,
  lead: unknown,
  flags: { followup: boolean; vday10: boolean; promoSlug: string | null },
): Promise<
  | { ok: true; baseCents: number; packageCents: number; promoSlug: string | null }
  | { ok: false; error: string; status: number }
>;
