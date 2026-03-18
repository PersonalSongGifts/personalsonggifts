import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { computeInputsHash } from "../_shared/hash-utils.ts";
import { logActivity } from "../_shared/activity-log.ts";
import { buildLeadFingerprint, buildLeadFingerprintFromInput } from "../_shared/lead-order-matching.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Timing constants (same as stripe-webhook)
const STABILIZATION_MINUTES = 5;
const HOURS_BEFORE_EXPECTED_TO_SEND = 12;

function calculateExpectedDelivery(tier: string): string {
  const now = new Date();
  if (tier === "priority") {
    return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }
  return new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
}

// Compute timing fields for background automation
function computeOrderTiming(expectedDelivery: string): {
  earliestGenerateAt: string;
  targetSendAt: string;
} {
  const now = Date.now();
  const expectedMs = new Date(expectedDelivery).getTime();
  
  const earliestGenerateAt = new Date(now + STABILIZATION_MINUTES * 60 * 1000).toISOString();
  
  let targetSendMs = expectedMs - HOURS_BEFORE_EXPECTED_TO_SEND * 60 * 60 * 1000;
  
  if (targetSendMs <= now) {
    targetSendMs = now + 30 * 60 * 1000;
    console.log(`[PROCESS-PAYMENT] target_send_at was past, adjusted to ${new Date(targetSendMs).toISOString()}`);
  }
  
  return {
    earliestGenerateAt,
    targetSendAt: new Date(targetSendMs).toISOString(),
  };
}


Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only allow POST
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { sessionId } = await req.json();

    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: "Session ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Retrieve the checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    });

    // Verify payment was successful
    if (session.payment_status !== "paid") {
      return new Response(
        JSON.stringify({ error: "Payment not completed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get metadata from the session
    const metadata = session.metadata || {};
    
    // Check if order already exists for this session (idempotency)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check for existing order with this payment intent
    const paymentIntentId = typeof session.payment_intent === "string" 
      ? session.payment_intent 
      : session.payment_intent?.id;

    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id, recipient_name, occasion, genre, pricing_tier, customer_email, expected_delivery, price_cents, revision_token")
      .eq("notes", `stripe_session:${sessionId}`)
      .single();

    if (existingOrder) {
      // Order already exists (webhook or prior call created it), return the details
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

    // Create the order with timing fields for background automation
    const pricingTier = metadata.pricingTier || "standard";

    // Canonical price: session.amount_total (Stripe's actual total charge, cents).
    // Single line item, no tax/shipping. Fallback: metadata -> legacy tier mapping.
    const priceCents: number = (session.amount_total
      ?? (metadata.amount_total_cents ? parseInt(metadata.amount_total_cents, 10) : NaN))
      || (pricingTier === "priority" ? 7999 : 4999);
    const price = Math.floor(priceCents / 100); // backward-compat integer dollars

    const expectedDelivery = calculateExpectedDelivery(pricingTier);

    // Strict notes format assertion -- do not proceed if format is wrong
    const notesValue = `stripe_session:${sessionId}`;
    if (!/^stripe_session:cs_[a-zA-Z0-9_]+$/.test(notesValue)) {
      console.error(`[PROCESS-PAYMENT] Unexpected notes format: ${notesValue}`);
      return new Response(
        JSON.stringify({ error: "Internal error: unexpected session ID format" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Compute timing for background automation
    const timing = computeOrderTiming(expectedDelivery);
    console.log(`[PROCESS-PAYMENT] Order timing: generate after ${timing.earliestGenerateAt}, send at ${timing.targetSendAt}`);
    
    // Compute inputs hash for change detection (includes all creative fields)
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
        price,               // integer dollars (backward compat)
        price_cents: priceCents, // canonical cents from Stripe amount_total
        expected_delivery: expectedDelivery,
        customer_name: metadata.customerName || "",
        customer_email: metadata.customerEmail || session.customer_email || "",
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
        notes: `stripe_session:${sessionId}`,
        status: "paid",
        // Language setting
        lyrics_language_code: metadata.lyricsLanguageCode || "en",
        // Background automation timing fields
        earliest_generate_at: timing.earliestGenerateAt,
        target_send_at: timing.targetSendAt,
        inputs_hash: inputsHash,
        delivery_status: "pending",
      })
      .select("id, recipient_name, occasion, genre, pricing_tier, customer_email, expected_delivery, price_cents, revision_token")
      .single();

    // Handle unique constraint violation (race condition) - re-query for existing order
    if (insertError) {
      // Check if it's a unique constraint violation (code 23505)
      if (insertError.code === "23505" || insertError.message?.includes("duplicate")) {
        console.log(`Race condition detected for session ${sessionId}, fetching existing order`);
        const { data: raceOrder } = await supabase
          .from("orders")
          .select("id, recipient_name, occasion, genre, pricing_tier, customer_email, expected_delivery, price_cents, revision_token")
          .eq("notes", `stripe_session:${sessionId}`)
          .single();

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

    await logActivity(supabase, "order", newOrder.id, "order_created", "system", `New order via process-payment, ${newOrder.pricing_tier}, $${priceCents / 100}`);

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
        .ilike("email", (metadata.customerEmail || session.customer_email || "").toLowerCase())
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
        console.log(`Lead ${matchingLead.id} marked as converted`);
      }
    } catch (leadError) {
      console.error("Failed to update lead status:", leadError);
      // Don't fail the order if lead update fails
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
    } catch (emailError) {
      console.error("Failed to send confirmation email:", emailError);
      // Don't fail the order if email fails
    }

    // Sync order to Zapier → Google Sheets (non-blocking)
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
            price: priceCents / 100, // canonical cents → dollars for external sync
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
            deviceType: "Web",
          }),
        });
        console.log(`Order ${newOrder.id} synced to Zapier`);
      } catch (zapierError) {
        console.error("Failed to sync to Zapier:", zapierError);
        // Don't fail the order if Zapier sync fails
      }
    }

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
    console.error("Process payment error:", error);
    const message = error instanceof Error ? error.message : "Failed to process payment";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
