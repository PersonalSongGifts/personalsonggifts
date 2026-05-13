import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_CENTS = 100;     // $1
const MAX_CENTS = 50000;   // $500

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { orderId, amountCents } = await req.json();

    if (!orderId || typeof orderId !== "string") {
      return new Response(
        JSON.stringify({ error: "orderId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const amount = Number(amountCents);
    if (!Number.isInteger(amount) || amount < MIN_CENTS || amount > MAX_CENTS) {
      return new Response(
        JSON.stringify({ error: `Tip must be between $${MIN_CENTS / 100} and $${MAX_CENTS / 100}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isShortId = orderId.length === 8;
    const isFullUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
    if (!isShortId && !isFullUUID) {
      return new Response(
        JSON.stringify({ error: "Invalid order ID format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let order: { id: string } | null = null;

    if (isShortId) {
      const { data, error } = await supabase.rpc("find_orders_by_short_id", {
        short_id: orderId,
        status_filter: ["delivered", "ready", "completed"],
        require_song_url: true,
        max_results: 2,
      });
      if (error) throw error;
      if (!data || data.length === 0) {
        return new Response(
          JSON.stringify({ error: "Order not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (data.length > 1) {
        return new Response(
          JSON.stringify({ error: "Ambiguous ID" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      order = { id: data[0].id };
    } else {
      const { data, error } = await supabase
        .from("orders")
        .select("id, song_url, status")
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      if (!data || !data.song_url) {
        return new Response(
          JSON.stringify({ error: "Order not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      order = { id: data.id };
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const origin = req.headers.get("origin") || "https://personalsonggifts.lovable.app";
    const shortOrderId = order!.id.slice(0, 8);

    const session = await stripe.checkout.sessions.create({
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: "Tip for the team",
            description: "A thank-you tip for the small team behind your personalized song.",
          },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: `${origin}/song/${shortOrderId}?tip=success&tip_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/song/${shortOrderId}?tip=cancelled`,
      metadata: {
        orderId: order!.id,
        entitlement: "song_tip",
        amountCents: String(amount),
      },
    });

    // Record pending tip
    await supabase.from("song_tips").insert({
      order_id: order!.id,
      amount_cents: amount,
      currency: "usd",
      stripe_session_id: session.id,
      status: "pending",
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("create-tip-checkout error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});