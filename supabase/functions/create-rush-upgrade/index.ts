import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RUSH_UPGRADE_PRICE_CENTS = 1000;

const FREE_TEST_CODES: Record<string, boolean> = {
  "HYPERDRIVETEST": true,
  "HYPERDRIVEFREE2026": true,
  "HYPERDRIVEFREE2026!": true,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { orderId, promoCode, returnPath } = await req.json();

    if (!orderId || typeof orderId !== "string") {
      return new Response(
        JSON.stringify({ error: "orderId is required" }),
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let order: { id: string; rush_addon: boolean | null; sent_at: string | null; status: string | null } | null = null;

    if (isShortId) {
      // Rush upgrade must remain available BEFORE delivery, so accept any status
      // and don't require a song_url yet.
      const { data, error } = await supabase.rpc("find_orders_by_short_id", {
        short_id: orderId,
        status_filter: null,
        require_song_url: false,
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
      order = data[0];
    } else {
      const { data, error } = await supabase
        .from("orders")
        .select("id, rush_addon, sent_at, status")
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      order = data;
    }

    if (!order) {
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (order.rush_addon) {
      return new Response(
        JSON.stringify({ alreadyRush: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (order.sent_at) {
      return new Response(
        JSON.stringify({ error: "Song has already been delivered — rush upgrade no longer available." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const upperCode = typeof promoCode === "string" ? promoCode.trim().toUpperCase() : "";
    if (upperCode && !FREE_TEST_CODES[upperCode]) {
      return new Response(
        JSON.stringify({ error: "That code isn't valid for the rush upgrade." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let unitAmount = RUSH_UPGRADE_PRICE_CENTS;
    const metadata: Record<string, string> = {
      type: "rush_upgrade",
      entitlement: "rush_upgrade",
      orderId: order.id,
    };
    if (upperCode && FREE_TEST_CODES[upperCode]) {
      unitAmount = 0;
      metadata.promoCode = upperCode;
      metadata.amount_total_cents = "0";
    }

    const safeReturnPath =
      typeof returnPath === "string" &&
      returnPath.startsWith("/") &&
      !returnPath.startsWith("//") &&
      !returnPath.includes("://") &&
      returnPath.length <= 400
        ? returnPath
        : null;

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const origin = req.headers.get("origin") || "https://personalsonggifts.lovable.app";

    const session = await stripe.checkout.sessions.create({
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: "1-Hour Express Delivery",
            description: "Upgrade this order to arrive within 1 hour.",
          },
          unit_amount: unitAmount,
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: safeReturnPath
        ? `${origin}${safeReturnPath}${safeReturnPath.includes("?") ? "&" : "?"}rush_session_id={CHECKOUT_SESSION_ID}`
        : `${origin}/song/${order.id}?rush_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: safeReturnPath ? `${origin}${safeReturnPath}` : `${origin}/song/${order.id}`,
      metadata,
      payment_intent_data: unitAmount > 0 ? { metadata } : undefined,
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Create rush upgrade error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});