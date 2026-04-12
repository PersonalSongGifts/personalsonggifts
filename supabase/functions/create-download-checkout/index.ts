import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DOWNLOAD_PRICE_ID = "price_1TLTh3Gax2m9otRwBESnhYKX";

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
        .select("id, song_url, download_unlocked_at, status")
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

    if (!order.song_url) {
      return new Response(
        JSON.stringify({ error: "Song is not ready yet" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Already unlocked
    if (order.download_unlocked_at) {
      return new Response(
        JSON.stringify({ alreadyUnlocked: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const origin = req.headers.get("origin") || "https://personalsonggifts.lovable.app";

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: DOWNLOAD_PRICE_ID, quantity: 1 }],
      mode: "payment",
      success_url: `${origin}/song/${orderId}?download_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/song/${orderId}`,
      metadata: {
        orderId: order.id,
        entitlement: "download_unlock",
      },
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Create download checkout error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
