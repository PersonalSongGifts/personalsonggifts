import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function calculateExpectedDelivery(tier: string): string {
  const now = new Date();
  if (tier === "priority") {
    // 3 hours from now
    return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString();
  }
  // 24 hours from now for standard
  return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
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
      .select("id, recipient_name, occasion, genre, pricing_tier, customer_email, expected_delivery")
      .eq("notes", `stripe_session:${sessionId}`)
      .single();

    if (existingOrder) {
      // Order already exists, return the details
      return new Response(
        JSON.stringify({
          orderId: existingOrder.id,
          recipientName: existingOrder.recipient_name,
          occasion: existingOrder.occasion,
          genre: existingOrder.genre,
          pricingTier: existingOrder.pricing_tier,
          customerEmail: existingOrder.customer_email,
          expectedDelivery: existingOrder.expected_delivery,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create the order
    const pricingTier = metadata.pricingTier || "standard";
    const price = pricingTier === "priority" ? 79 : 49;
    const expectedDelivery = calculateExpectedDelivery(pricingTier);

    const { data: newOrder, error: insertError } = await supabase
      .from("orders")
      .insert({
        pricing_tier: pricingTier,
        price,
        expected_delivery: expectedDelivery,
        customer_name: metadata.customerName || "",
        customer_email: metadata.customerEmail || session.customer_email || "",
        customer_phone: metadata.customerPhone || null,
        recipient_type: metadata.recipientType || "",
        recipient_name: metadata.recipientName || "",
        occasion: metadata.occasion || "",
        genre: metadata.genre || "",
        singer_preference: metadata.singerPreference || "",
        relationship: metadata.relationship || "",
        special_qualities: metadata.specialQualities || "",
        favorite_memory: metadata.favoriteMemory || "",
        special_message: metadata.specialMessage || null,
        device_type: "Web",
        notes: `stripe_session:${sessionId}`,
        status: "paid",
      })
      .select("id, recipient_name, occasion, genre, pricing_tier, customer_email, expected_delivery")
      .single();

    if (insertError) {
      console.error("Database error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create order" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
