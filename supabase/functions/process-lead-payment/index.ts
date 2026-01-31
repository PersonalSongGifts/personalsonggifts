import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      .select("id, recipient_name, occasion, genre, pricing_tier, customer_email, song_url")
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
    const price = pricingTier === "priority" ? 79 : 49;

    // Create order from lead data
    const { data: newOrder, error: insertError } = await supabase
      .from("orders")
      .insert({
        pricing_tier: pricingTier,
        price: price,
        expected_delivery: new Date().toISOString(), // Immediate - already heard preview
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
        song_url: lead.full_song_url, // Copy the full song URL from lead
        song_title: lead.song_title,
        cover_image_url: lead.cover_image_url,
        device_type: "Web",
        notes: `lead_session:${sessionId}`,
        status: "delivered", // Immediate delivery since song already exists
        delivered_at: new Date().toISOString(),
      })
      .select("id, recipient_name, occasion, genre, pricing_tier, customer_email, song_url")
      .single();

    if (insertError) {
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
          price: price,
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
      await fetch(`${supabaseUrl}/functions/v1/send-song-delivery`, {
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
        }),
      });
      console.log("Full song delivery email sent");
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
