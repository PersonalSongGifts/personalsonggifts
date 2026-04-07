import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_BONUS_PRICE_ID = "price_1TJTR2Gax2m9otRw0MmfmD4L";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { orderId } = await req.json();

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

    let order: any = null;

    if (isShortId) {
      const { data, error } = await supabase
        .rpc("find_orders_by_short_id", {
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
      order = data[0];
    } else {
      const { data, error } = await supabase
        .from("orders")
        .select("id, bonus_song_url, bonus_preview_url, bonus_unlocked_at, status")
        .eq("id", orderId)
        .limit(1)
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

    if (!order.bonus_preview_url && !order.bonus_song_url) {
      return new Response(
        JSON.stringify({ error: "Bonus track is not available yet" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Already unlocked
    if (order.bonus_unlocked_at) {
      return new Response(
        JSON.stringify({ alreadyUnlocked: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for active promo with bonus_price_cents
    let priceCents = 1999; // Default $19.99
    const now = new Date().toISOString();
    const { data: promoData } = await supabase
      .from("promotions")
      .select("bonus_price_cents")
      .eq("is_active", true)
      .lte("starts_at", now)
      .gte("ends_at", now)
      .not("bonus_price_cents", "is", null)
      .limit(1)
      .maybeSingle();

    if (promoData?.bonus_price_cents && promoData.bonus_price_cents > 0) {
      priceCents = promoData.bonus_price_cents;
      console.log(`[BONUS-CHECKOUT] Using promo price: ${priceCents} cents`);
    } else {
      // Check admin_settings for custom default price
      const { data: priceSetting } = await supabase
        .from("admin_settings")
        .select("value")
        .eq("key", "bonus_song_price_cents")
        .maybeSingle();
      if (priceSetting?.value) {
        const parsed = parseInt(priceSetting.value, 10);
        if (parsed > 0) priceCents = parsed;
      }
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const origin = req.headers.get("origin") || "https://personalsonggifts.lovable.app";

    const session = await stripe.checkout.sessions.create({
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: "Acoustic Bonus Track Unlock",
            description: "Unlock the full acoustic version of your personalized song — includes download access.",
          },
          unit_amount: priceCents,
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: `${origin}/song/${orderId}?bonus_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/song/${orderId}`,
      metadata: {
        orderId: order.id,
        entitlement: "bonus_unlock",
      },
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Create bonus checkout error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
