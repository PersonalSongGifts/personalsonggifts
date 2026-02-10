import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LYRICS_PRICE_ID = "price_1Sz4rQGax2m9otRwuiNX9sEc";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { orderId, promoCode } = await req.json();

    if (!orderId || typeof orderId !== "string") {
      return new Response(
        JSON.stringify({ error: "orderId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve order — support short ID (8 char) or full UUID
    const isShortId = orderId.length === 8;
    const isFullUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);

    if (!isShortId && !isFullUUID) {
      return new Response(
        JSON.stringify({ error: "Invalid order ID format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let orders: any[] | null = null;

    if (isShortId) {
      const { data, error } = await supabase
        .from("orders")
        .select("id, automation_lyrics, lyrics_unlocked_at")
        .not("song_url", "is", null);

      if (error) throw error;
      orders = data?.filter((o: any) => o.id.toLowerCase().startsWith(orderId.toLowerCase())) || [];
    } else {
      const { data, error } = await supabase
        .from("orders")
        .select("id, automation_lyrics, lyrics_unlocked_at")
        .eq("id", orderId);

      if (error) throw error;
      orders = data || [];
    }

    if (orders.length === 0) {
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (orders.length > 1) {
      return new Response(
        JSON.stringify({ error: "Ambiguous ID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const order = orders[0];

    // Validate lyrics exist
    if (!order.automation_lyrics || order.automation_lyrics.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Lyrics are not available for this order" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Already unlocked
    if (order.lyrics_unlocked_at) {
      return new Response(
        JSON.stringify({ alreadyUnlocked: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Stripe checkout session
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const shortId = order.id.substring(0, 8).toUpperCase();
    const origin = req.headers.get("origin") || "https://personalsonggifts.lovable.app";

    // If promoCode provided, look up coupon and apply directly
    let sessionDiscountParams: Record<string, any> = { allow_promotion_codes: true };

    if (promoCode && typeof promoCode === "string" && promoCode.trim().length > 0) {
      const code = promoCode.trim();
      const upperCode = code.toUpperCase();
      let coupon: any = null;

      // Try retrieve by ID (original case, then uppercase)
      try {
        coupon = await stripe.coupons.retrieve(code);
      } catch {
        try {
          coupon = await stripe.coupons.retrieve(upperCode);
        } catch {
          coupon = null;
        }
      }

      // If not found by ID, search by name
      if (!coupon) {
        const coupons = await stripe.coupons.list({ limit: 100 });
        coupon = coupons.data.find(
          (c: any) => c.name?.toUpperCase() === upperCode || c.id.toUpperCase() === upperCode
        );
      }

      if (coupon && coupon.valid) {
        sessionDiscountParams = { discounts: [{ coupon: coupon.id }] };
      } else {
        return new Response(
          JSON.stringify({ error: "Invalid promo code" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: LYRICS_PRICE_ID, quantity: 1 }],
      mode: "payment",
      ...sessionDiscountParams,
      success_url: `${origin}/song/${shortId}?lyrics_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/song/${shortId}`,
      metadata: {
        orderId: order.id,
        entitlement: "lyrics_unlock",
      },
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Create lyrics checkout error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
