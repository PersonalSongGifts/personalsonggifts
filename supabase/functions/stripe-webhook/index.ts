import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

function calculateExpectedDelivery(tier: string): string {
  const now = new Date();
  if (tier === "priority") {
    // 24 hours from now
    return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }
  // 48 hours from now for standard
  return new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Get the raw body and signature
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      console.error("No stripe-signature header");
      return new Response(
        JSON.stringify({ error: "No signature provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET not configured");
      return new Response(
        JSON.stringify({ error: "Webhook secret not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the webhook signature
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Received webhook event: ${event.type}`);

    // Handle checkout.session.completed event
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      // Only process if payment was successful
      if (session.payment_status !== "paid") {
        console.log(`Skipping session ${session.id} - payment_status: ${session.payment_status}`);
        return new Response(
          JSON.stringify({ received: true, skipped: "payment not completed" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Initialize Supabase
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Check if order already exists (idempotency)
      const { data: existingOrder } = await supabase
        .from("orders")
        .select("id")
        .eq("notes", `stripe_session:${session.id}`)
        .single();

      if (existingOrder) {
        console.log(`Order already exists for session ${session.id}: ${existingOrder.id}`);
        return new Response(
          JSON.stringify({ received: true, orderId: existingOrder.id, status: "already_exists" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get metadata from the session
      const metadata = session.metadata || {};

      // Check if this is a lead conversion (has leadId in metadata)
      if (metadata.leadId) {
        console.log(`Lead conversion detected for lead ${metadata.leadId}, skipping - handled by process-lead-payment`);
        return new Response(
          JSON.stringify({ received: true, skipped: "lead conversion handled by separate endpoint" }),
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
          special_qualities: metadata.specialQualities || "",
          favorite_memory: metadata.favoriteMemory || "",
          special_message: metadata.specialMessage || null,
          device_type: "Web",
          notes: `stripe_session:${session.id}`,
          status: "paid",
          // UTM tracking fields
          utm_source: metadata.utmSource || null,
          utm_medium: metadata.utmMedium || null,
          utm_campaign: metadata.utmCampaign || null,
          utm_content: metadata.utmContent || null,
          utm_term: metadata.utmTerm || null,
        })
        .select("id, recipient_name, occasion, genre, pricing_tier, customer_email, expected_delivery")
        .single();

      // Handle unique constraint violation (race condition) - return existing order
      if (insertError) {
        // Check if it's a unique constraint violation (code 23505)
        if (insertError.code === "23505" || insertError.message?.includes("duplicate")) {
          console.log(`Race condition in webhook for session ${session.id}, fetching existing order`);
          const { data: raceOrder } = await supabase
            .from("orders")
            .select("id")
            .eq("notes", `stripe_session:${session.id}`)
            .single();

          if (raceOrder) {
            return new Response(
              JSON.stringify({ received: true, orderId: raceOrder.id, status: "already_exists" }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        console.error("Database error:", insertError);
        // Return 500 so Stripe will retry
        return new Response(
          JSON.stringify({ error: "Failed to create order" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Order created via webhook: ${newOrder.id}`);

      // Mark matching lead as converted (non-blocking)
      try {
        const { data: matchingLead } = await supabase
          .from("leads")
          .select("id")
          .eq("email", (metadata.customerEmail || session.customer_email || "").toLowerCase())
          .eq("status", "lead")
          .single();

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
          }),
        });
        console.log(`Confirmation email sent for order ${newOrder.id}`);
      } catch (emailError) {
        console.error("Failed to send confirmation email:", emailError);
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
              price: price,
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
        }
      }

      return new Response(
        JSON.stringify({ received: true, orderId: newOrder.id, status: "created" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Acknowledge other event types we don't handle
    console.log(`Unhandled event type: ${event.type}`);
    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Stripe webhook error:", error);
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
