import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { computeInputsHash } from "../_shared/hash-utils.ts";
import { logActivity } from "../_shared/activity-log.ts";
import { buildLeadFingerprint, buildLeadFingerprintFromInput } from "../_shared/lead-order-matching.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Limited-use codes that need usage count incremented on capture
const LIMITED_CODES: Record<string, { maxUses: number; settingsKey: string }> = {
  "BRIANNAWARREN": { maxUses: 5, settingsKey: "briannawarren_usage_count" },
  "INFLCR-SPARK-7X": { maxUses: 1, settingsKey: "inflcr_spark_7x_usage_count" },
  "INFLCR-WAVE-3K": { maxUses: 1, settingsKey: "inflcr_wave_3k_usage_count" },
  "INFLCR-GLOW-9M": { maxUses: 1, settingsKey: "inflcr_glow_9m_usage_count" },
  "INFLCR-RISE-5Q": { maxUses: 1, settingsKey: "inflcr_rise_5q_usage_count" },
};

// Timing constants (same as stripe-webhook / process-payment)
const STABILIZATION_MINUTES = 5;
const HOURS_BEFORE_EXPECTED_TO_SEND = 12;

function calculateExpectedDelivery(tier: string): string {
  const now = new Date();
  if (tier === "priority") {
    return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }
  return new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
}

function computeOrderTiming(expectedDelivery: string) {
  const now = Date.now();
  const expectedMs = new Date(expectedDelivery).getTime();
  const earliestGenerateAt = new Date(now + STABILIZATION_MINUTES * 60 * 1000).toISOString();
  let targetSendMs = expectedMs - HOURS_BEFORE_EXPECTED_TO_SEND * 60 * 60 * 1000;
  if (targetSendMs <= now) {
    targetSendMs = now + 30 * 60 * 1000;
  }
  return {
    earliestGenerateAt,
    targetSendAt: new Date(targetSendMs).toISOString(),
  };
}

async function getPayPalAccessToken(): Promise<string> {
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID")!;
  const secretKey = Deno.env.get("PAYPAL_SECRET_KEY")!;
  const auth = btoa(`${clientId}:${secretKey}`);

  const response = await fetch("https://api-m.paypal.com/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new Error(`PayPal auth failed: ${await response.text()}`);
  }

  const data = await response.json();
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { orderID } = await req.json();

    if (!orderID) {
      return new Response(
        JSON.stringify({ error: "PayPal order ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Idempotency: check if order already exists for this PayPal order
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id, recipient_name, occasion, genre, pricing_tier, customer_email, expected_delivery, price_cents, revision_token")
      .eq("notes", `paypal_order:${orderID}`)
      .maybeSingle();

    if (existingOrder) {
      return new Response(
        JSON.stringify({
          orderId: existingOrder.id,
          recipientName: existingOrder.recipient_name,
          occasion: existingOrder.occasion,
          genre: existingOrder.genre,
          pricingTier: existingOrder.pricing_tier,
          customerEmail: existingOrder.customer_email,
          expectedDelivery: existingOrder.expected_delivery,
          price: existingOrder.price_cents != null ? existingOrder.price_cents / 100 : undefined,
          revisionToken: existingOrder.revision_token,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Retrieve stored metadata
    const { data: metadataRecord } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("key", `paypal_order:${orderID}`)
      .maybeSingle();

    if (!metadataRecord) {
      return new Response(
        JSON.stringify({ error: "PayPal order metadata not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const metadata: Record<string, string> = JSON.parse(metadataRecord.value);

    // Capture the PayPal payment
    const accessToken = await getPayPalAccessToken();
    const captureResponse = await fetch(`https://api-m.paypal.com/v2/checkout/orders/${orderID}/capture`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!captureResponse.ok) {
      const err = await captureResponse.text();
      console.error("PayPal capture error:", err);
      return new Response(
        JSON.stringify({ error: "Failed to capture PayPal payment" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const captureData = await captureResponse.json();

    if (captureData.status !== "COMPLETED") {
      return new Response(
        JSON.stringify({ error: "PayPal payment not completed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get actual amount captured
    const capturedAmount = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.amount;
    const priceCents = capturedAmount
      ? Math.round(parseFloat(capturedAmount.value) * 100)
      : parseInt(metadata.amount_total_cents || "4999", 10);
    const price = Math.floor(priceCents / 100);

    // Increment limited code usage if applicable
    const promoCode = metadata.promoCode;
    if (promoCode && LIMITED_CODES[promoCode]) {
      const limit = LIMITED_CODES[promoCode];
      const { data } = await supabase
        .from("admin_settings")
        .select("value")
        .eq("key", limit.settingsKey)
        .maybeSingle();
      const currentUses = parseInt(data?.value || "0", 10);
      await supabase
        .from("admin_settings")
        .upsert({
          key: limit.settingsKey,
          value: String(currentUses + 1),
          updated_at: new Date().toISOString(),
        });
    }

    // Create order
    const pricingTier = metadata.pricingTier || "standard";
    const expectedDelivery = calculateExpectedDelivery(pricingTier);
    const timing = computeOrderTiming(expectedDelivery);

    const inputsHash = await computeInputsHash([
      metadata.recipientName || "",
      metadata.recipientNamePronunciation || "",
      metadata.specialQualities || "",
      metadata.favoriteMemory || "",
      metadata.genre || "",
      metadata.occasion || "",
      metadata.singerPreference || "",
      metadata.lyricsLanguageCode || "en",
    ]);

    const { data: newOrder, error: insertError } = await supabase
      .from("orders")
      .insert({
        pricing_tier: pricingTier,
        price,
        price_cents: priceCents,
        expected_delivery: expectedDelivery,
        customer_name: metadata.customerName || "",
        customer_email: metadata.customerEmail || "",
        customer_phone: metadata.customerPhone || null,
        recipient_type: metadata.recipientType || "",
        recipient_name: metadata.recipientName || "",
        occasion: metadata.occasion || "",
        genre: metadata.genre || "",
        singer_preference: metadata.singerPreference || "",
        special_qualities: metadata.specialQualities || "",
        favorite_memory: metadata.favoriteMemory || "",
        special_message: metadata.specialMessage || null,
        device_type: "Web",
        notes: `paypal_order:${orderID}`,
        status: "paid",
        lyrics_language_code: metadata.lyricsLanguageCode || "en",
        earliest_generate_at: timing.earliestGenerateAt,
        target_send_at: timing.targetSendAt,
        inputs_hash: inputsHash,
        delivery_status: "pending",
        // UTM fields
        utm_source: metadata.utmSource || null,
        utm_medium: metadata.utmMedium || null,
        utm_campaign: metadata.utmCampaign || null,
        utm_content: metadata.utmContent || null,
        utm_term: metadata.utmTerm || null,
        // Phone fields
        phone_e164: metadata.phoneE164 || null,
        sms_opt_in: metadata.smsOptIn === "true",
        timezone: metadata.timezone || null,
      })
      .select("id, recipient_name, occasion, genre, pricing_tier, customer_email, expected_delivery, price_cents, revision_token")
      .single();

    if (insertError) {
      // Handle race condition
      if (insertError.code === "23505" || insertError.message?.includes("duplicate")) {
        const { data: raceOrder } = await supabase
          .from("orders")
          .select("id, recipient_name, occasion, genre, pricing_tier, customer_email, expected_delivery, price_cents, revision_token")
          .eq("notes", `paypal_order:${orderID}`)
          .maybeSingle();
        if (raceOrder) {
          return new Response(
            JSON.stringify({
              orderId: raceOrder.id,
              recipientName: raceOrder.recipient_name,
              occasion: raceOrder.occasion,
              genre: raceOrder.genre,
              pricingTier: raceOrder.pricing_tier,
              customerEmail: raceOrder.customer_email,
              expectedDelivery: raceOrder.expected_delivery,
              price: raceOrder.price_cents != null ? raceOrder.price_cents / 100 : undefined,
              revisionToken: raceOrder.revision_token,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      console.error("Database error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create order" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await logActivity(supabase, "order", newOrder.id, "order_created", "system", `New order via PayPal, ${pricingTier}, $${priceCents / 100}`);

    // Mark only the matching lead as converted (non-blocking)
    try {
      const orderFingerprint = buildLeadFingerprintFromInput({
        recipientName: metadata.recipientName || "",
        recipientType: metadata.recipientType || "",
        occasion: metadata.occasion || "",
        genre: metadata.genre || "",
        singerPreference: metadata.singerPreference || "",
        specialQualities: metadata.specialQualities || "",
        favoriteMemory: metadata.favoriteMemory || "",
        specialMessage: metadata.specialMessage || "",
        lyricsLanguageCode: metadata.lyricsLanguageCode || "en",
      });

      const { data: leadCandidates } = await supabase
        .from("leads")
        .select("id, email, captured_at, recipient_name, recipient_type, occasion, genre, singer_preference, special_qualities, favorite_memory, special_message, lyrics_language_code")
        .ilike("email", (metadata.customerEmail || "").toLowerCase())
        .neq("status", "converted")
        .order("captured_at", { ascending: false })
        .limit(20);

      const matchingLead = (leadCandidates || []).find((lead) =>
        new Date(lead.captured_at).getTime() <= Date.now() && buildLeadFingerprint(lead) === orderFingerprint
      );

      if (matchingLead) {
        await supabase
          .from("leads")
          .update({
            status: "converted",
            converted_at: new Date().toISOString(),
            order_id: newOrder.id,
          })
          .eq("id", matchingLead.id);
      }
    } catch (e) {
      console.error("Failed to update lead:", e);
    }

    // Send order confirmation email (non-blocking)
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-order-confirmation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          orderId: newOrder.id,
          customerEmail: newOrder.customer_email,
          customerName: metadata.customerName || "",
          recipientName: newOrder.recipient_name,
          occasion: newOrder.occasion,
          genre: newOrder.genre,
          pricingTier: newOrder.pricing_tier,
          expectedDelivery: newOrder.expected_delivery,
          revisionToken: newOrder.revision_token,
        }),
      });
    } catch (e) {
      console.error("Failed to send confirmation email:", e);
    }

    // Sync to Zapier (non-blocking)
    const zapierWebhookUrl = Deno.env.get("ZAPIER_WEBHOOK_URL");
    if (zapierWebhookUrl) {
      try {
        await fetch(zapierWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: newOrder.id,
            createdAt: new Date().toISOString(),
            status: "paid",
            pricingTier: newOrder.pricing_tier,
            price: priceCents / 100,
            expectedDelivery: newOrder.expected_delivery,
            customerName: metadata.customerName || "",
            customerEmail: newOrder.customer_email,
            customerPhone: metadata.customerPhone || "",
            recipientType: metadata.recipientType || "",
            recipientName: newOrder.recipient_name,
            occasion: newOrder.occasion,
            genre: newOrder.genre,
            singerPreference: metadata.singerPreference || "",
            specialQualities: metadata.specialQualities || "",
            favoriteMemory: metadata.favoriteMemory || "",
            specialMessage: metadata.specialMessage || "",
            deviceType: "Web (PayPal)",
          }),
        });
      } catch (e) {
        console.error("Failed to sync to Zapier:", e);
      }
    }

    // Clean up temporary metadata
    await supabase
      .from("admin_settings")
      .delete()
      .eq("key", `paypal_order:${orderID}`);

    return new Response(
      JSON.stringify({
        orderId: newOrder.id,
        recipientName: newOrder.recipient_name,
        occasion: newOrder.occasion,
        genre: newOrder.genre,
        pricingTier: newOrder.pricing_tier,
        customerEmail: newOrder.customer_email,
        expectedDelivery: newOrder.expected_delivery,
        price: newOrder.price_cents != null ? newOrder.price_cents / 100 : priceCents / 100,
        revisionToken: newOrder.revision_token,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("PayPal capture error:", error);
    const message = error instanceof Error ? error.message : "Failed to process PayPal payment";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
