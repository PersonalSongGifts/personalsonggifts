import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { logActivity } from "../_shared/activity-log.ts";
import { buildLeadAssetPatch } from "../_shared/lead-conversion.ts";
import { hasReadyLeadBonus, resolveLeadCheckoutAmounts } from "../_shared/lead-checkout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Non-blocking operator alert for paid-but-blocked lead sessions. Fully
// swallowed: a Brevo failure must never change the HTTP response or throw.
async function alertPaidLeadSessionBlocked(
  sessionId: string,
  leadId: string,
  failedCheck: string,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    if (!brevoApiKey) return;
    const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL") || "support@personalsonggifts.com";
    const senderName = Deno.env.get("BREVO_SENDER_NAME") || "Personal Song Gifts";
    const body = [
      `A paid lead checkout session was blocked before order creation.`,
      ``,
      `Failed check: ${failedCheck}`,
      `Stripe session id: ${sessionId}`,
      `Lead id: ${leadId}`,
      details ? `Details: ${JSON.stringify(details)}` : "",
      ``,
      `The endpoint returned 500 so the caller will retry. If this alert repeats, a human needs to intervene.`,
    ].filter(Boolean).join("\n");
    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "api-key": brevoApiKey,
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: "support@personalsonggifts.com", name: "Support" }],
        subject: "ALERT: paid lead session blocked",
        textContent: body,
      }),
    });
  } catch (alertErr) {
    console.error("[LEAD-PAYMENT] paid-lead-blocked alert failed (non-blocking):", alertErr);
  }
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

    const { sessionId } = await req.json();

    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: "Session ID required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Retrieve checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    });

    // Verify payment
    if (session.payment_status !== "paid") {
      return new Response(
        JSON.stringify({ error: "Payment not completed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const metadata = session.metadata || {};
    
    // Verify this is a lead conversion
    if (metadata.source !== "lead" || !metadata.leadId) {
      return new Response(
        JSON.stringify({ error: "Invalid lead payment" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check for existing order with this session (idempotency)
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id, recipient_name, occasion, genre, pricing_tier, customer_email, song_url, price_cents, package_unlocked_at, package_unlock_session_id, package_price_cents")
      .eq("notes", `lead_session:${sessionId}`)
      .single();

    if (existingOrder) {
      return new Response(
        JSON.stringify({
          orderId: existingOrder.id,
          recipientName: existingOrder.recipient_name,
          occasion: existingOrder.occasion,
          genre: existingOrder.genre,
          pricingTier: existingOrder.pricing_tier,
          customerEmail: existingOrder.customer_email,
          songUrl: existingOrder.song_url,
          price: existingOrder.price_cents != null ? existingOrder.price_cents / 100 : undefined,
          package_unlocked: !!existingOrder.package_unlocked_at,
          package_addon_cents: existingOrder.package_unlock_session_id === sessionId
            ? (existingOrder.package_price_cents || 0)
            : 0,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get lead data including song URLs
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", metadata.leadId)
      .single();

    if (leadError || !lead) {
      console.error("Lead not found:", leadError);
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const pricingTier = metadata.pricingTier || "standard";

    const checkoutAmounts = resolveLeadCheckoutAmounts(session.amount_total, metadata);
    if (!checkoutAmounts) {
      console.error(`[LEAD-PAYMENT] Invalid checkout pricing for ${sessionId}`, {
        amount_total: session.amount_total,
        forever_memory: metadata.forever_memory,
        package_price_cents: metadata.package_price_cents,
        offerPriceCents: metadata.offerPriceCents,
      });
      return new Response(
        JSON.stringify({ error: "Invalid lead checkout pricing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const priceCents = checkoutAmounts.baseCents;
    const price = Math.floor(priceCents / 100); // backward-compat integer dollars

    if (checkoutAmounts.hasForeverMemory && !hasReadyLeadBonus(lead)) {
      console.error(`[LEAD-PAYMENT] Package lead ${lead.id} no longer has a ready bonus asset for session ${sessionId}`);
      return new Response(
        JSON.stringify({ error: "Package fulfilment asset is unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Strict notes format assertion -- do not proceed if format is wrong
    const notesValue = `lead_session:${sessionId}`;
    if (!/^lead_session:cs_[a-zA-Z0-9_]+$/.test(notesValue)) {
      console.error(`[LEAD-PAYMENT] Unexpected notes format: ${notesValue}`);
      return new Response(
        JSON.stringify({ error: "Internal error: unexpected session ID format" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const conversionNow = new Date().toISOString();
    const leadAssetPatch = buildLeadAssetPatch(lead, new Date(conversionNow)) || {};
    const paymentIntentId = typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
    const leadPackageFields = checkoutAmounts.hasForeverMemory ? {
      package_unlocked_at: conversionNow,
      package_price_cents: checkoutAmounts.packageCents,
      package_unlock_session_id: session.id,
      package_unlock_payment_intent_id: paymentIntentId,
      lyrics_unlocked_at: conversionNow,
      lyrics_price_cents: 0,
      download_unlocked_at: conversionNow,
      download_price_cents: 0,
      bonus_unlocked_at: conversionNow,
      bonus_price_cents: 0,
    } : {};

    // Create order from lead data. The shared patch carries pre-generated
    // primary and bonus assets across rather than leaving them on the lead.
    const { data: newOrder, error: insertError } = await supabase
      .from("orders")
      .insert({
        pricing_tier: pricingTier,
        price: price,            // integer dollars (backward compat)
        price_cents: priceCents, // canonical cents from Stripe amount_total
        expected_delivery: conversionNow, // Immediate - already heard preview
        customer_name: lead.customer_name,
        customer_email: lead.email,
        customer_phone: lead.phone,
        recipient_type: lead.recipient_type,
        recipient_name: lead.recipient_name,
        occasion: lead.occasion,
        genre: lead.genre,
        singer_preference: lead.singer_preference,
        special_qualities: lead.special_qualities,
        favorite_memory: lead.favorite_memory,
        special_message: lead.special_message,
        lyrics_language_code: lead.lyrics_language_code || "en",
        inputs_hash: lead.inputs_hash,
        device_type: "Web",
        notes: `lead_session:${sessionId}`,
        ...leadAssetPatch,
        ...leadPackageFields,
      })
      .select("id, recipient_name, occasion, genre, pricing_tier, customer_email, song_url, price_cents, package_unlocked_at, package_price_cents")
      .single();

    // Handle unique constraint violation (race condition) - re-query for existing order
    if (insertError) {
      // Check if it's a unique constraint violation (code 23505)
      if (insertError.code === "23505" || insertError.message?.includes("duplicate")) {
        console.log(`Race condition detected for lead session ${sessionId}, fetching existing order`);
        const { data: raceOrder } = await supabase
          .from("orders")
          .select("id, recipient_name, occasion, genre, pricing_tier, customer_email, song_url, price_cents, package_unlocked_at, package_unlock_session_id, package_price_cents")
          .eq("notes", `lead_session:${sessionId}`)
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
              songUrl: raceOrder.song_url,
              price: raceOrder.price_cents != null ? raceOrder.price_cents / 100 : undefined,
              package_unlocked: !!raceOrder.package_unlocked_at,
              package_addon_cents: raceOrder.package_unlock_session_id === sessionId
                ? (raceOrder.package_price_cents || 0)
                : 0,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      console.error("Order creation error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create order" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark lead as converted
    await supabase
      .from("leads")
      .update({
        status: "converted",
        converted_at: new Date().toISOString(),
        order_id: newOrder.id,
      })
      .eq("id", lead.id);

    console.log(`Lead ${lead.id} converted to order ${newOrder.id}`);

    await logActivity(supabase, "lead", lead.id, "lead_converted", "system", `Converted to order ${newOrder.id.slice(0, 8).toUpperCase()}`);
    await logActivity(
      supabase,
      "order",
      newOrder.id,
      "order_created",
      "system",
      `Created from lead conversion, $${checkoutAmounts.totalCents / 100}${checkoutAmounts.hasForeverMemory ? " including Forever Memory Package" : ""}`,
    );

    // Fallback: if lyrics are missing, trigger generation for the new order.
    // Use force=true when audio exists so the lyrics guard is bypassed.
    if (!lead.automation_lyrics) {
      try {
        const hasAudio = !!lead.full_song_url;
        console.log(`Lyrics missing on lead ${lead.id} (audio=${hasAudio}), triggering generation for order ${newOrder.id}${hasAudio ? " with force" : ""}`);
        await fetch(`${supabaseUrl}/functions/v1/automation-generate-lyrics`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ orderId: newOrder.id, type: "order", ...(hasAudio && { force: true }) }),
        });
      } catch (e) {
        console.error("Failed to trigger fallback lyrics generation:", e);
      }
    }

    // Sync to Google Sheets - update lead row to converted and add order row
    try {
      await fetch(`${supabaseUrl}/functions/v1/append-to-sheet`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          orderId: newOrder.id,
          createdAt: new Date().toISOString(),
          status: "delivered",
          pricingTier: pricingTier,
          price: checkoutAmounts.totalCents / 100, // exact charged total for external sync
          customerName: lead.customer_name,
          customerEmail: lead.email,
          customerPhone: lead.phone || "",
          recipientName: lead.recipient_name,
          occasion: lead.occasion,
          genre: lead.genre,
          singerPreference: lead.singer_preference,
          specialQualities: lead.special_qualities,
          favoriteMemory: lead.favorite_memory,
          specialMessage: lead.special_message || "",
          deviceType: "Web (Lead Conversion)",
        }),
      });
    } catch (e) {
      console.error("Failed to sync to Google Sheets:", e);
    }

    // Send full song delivery email immediately
    try {
      const deliveryResponse = await fetch(`${supabaseUrl}/functions/v1/send-song-delivery`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          orderId: newOrder.id,
          customerEmail: lead.email,
          customerName: lead.customer_name,
          recipientName: lead.recipient_name,
          occasion: lead.occasion,
          songUrl: lead.full_song_url,
          revisionToken: newOrder.revision_token,
        }),
      });
      if (deliveryResponse.ok) {
        await supabase
          .from("orders")
          .update({ sent_at: new Date().toISOString(), delivery_status: "sent" })
          .eq("id", newOrder.id);
        console.log("Full song delivery email sent");
      } else {
        console.error("Full song delivery email failed:", await deliveryResponse.text().catch(() => ""));
      }
    } catch (e) {
      console.error("Failed to send delivery email:", e);
    }

    return new Response(
      JSON.stringify({
        orderId: newOrder.id,
        recipientName: newOrder.recipient_name,
        occasion: newOrder.occasion,
        genre: newOrder.genre,
        pricingTier: newOrder.pricing_tier,
        customerEmail: newOrder.customer_email,
        songUrl: newOrder.song_url,
        price: newOrder.price_cents != null ? newOrder.price_cents / 100 : priceCents / 100,
        package_unlocked: !!newOrder.package_unlocked_at,
        package_addon_cents: checkoutAmounts.hasForeverMemory ? checkoutAmounts.packageCents : 0,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Process lead payment error:", error);
    const message = error instanceof Error ? error.message : "Server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
