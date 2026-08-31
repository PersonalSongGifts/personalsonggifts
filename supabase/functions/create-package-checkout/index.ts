import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PACKAGE_PRICE_CENTS = 2400; // $24 (post-purchase / song-page package)

// Hardcoded 100%-off test codes (mirror create-checkout FREE_TEST_CODES)
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
        .select("id, package_unlocked_at, status")
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

    // Load the canonical current fulfilment state even when the caller used a
    // short order ID. This prevents a post-purchase package checkout from
    // being created before its included second version exists.
    const { data: currentOrder, error: currentOrderError } = await supabase
      .from("orders")
      .select("id, package_unlocked_at, bonus_song_url, bonus_automation_status")
      .eq("id", order.id)
      .maybeSingle();

    if (currentOrderError) throw currentOrderError;
    if (!currentOrder) {
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Already unlocked
    if (currentOrder.package_unlocked_at) {
      return new Response(
        JSON.stringify({ alreadyUnlocked: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!currentOrder.bonus_song_url) {
      return new Response(
        JSON.stringify({
          error: "Your included second version is still being prepared. Please return once it appears on the song page to add the package.",
          code: "BONUS_NOT_READY",
          bonusStatus: currentOrder.bonus_automation_status || null,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    order = currentOrder;

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const origin = req.headers.get("origin") || "https://personalsonggifts.lovable.app";

    // Resolve unit amount, honoring hardcoded 100%-off test codes
    const upperCode = typeof promoCode === "string" ? promoCode.trim().toUpperCase() : "";

    if (upperCode && !FREE_TEST_CODES[upperCode]) {
      return new Response(
        JSON.stringify({ error: "That code isn't valid for the Forever Memory Package." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let unitAmount = PACKAGE_PRICE_CENTS;
    const metadata: Record<string, string> = {
      type: "package_unlock",
      entitlement: "package_unlock",
      orderId: order.id,
    };

    if (upperCode && FREE_TEST_CODES[upperCode]) {
      unitAmount = 0;
      metadata.promoCode = upperCode;
      metadata.amount_total_cents = "0";
    }


    // Optional safe relative return path (e.g. "/payment-success?session_id=cs_x").
    // Must be a same-origin relative path — reject anything absolute or protocol-like.
    const safeReturnPath =
      typeof returnPath === "string" &&
      returnPath.startsWith("/") &&
      !returnPath.startsWith("//") &&
      !returnPath.includes("://") &&
      returnPath.length <= 400
        ? returnPath
        : null;

    const session = await stripe.checkout.sessions.create({
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: "Forever Memory Package",
            description: "Full lyrics, high-quality download, and the acoustic bonus track — bundled together.",
          },
          unit_amount: unitAmount,
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: safeReturnPath
        ? `${origin}${safeReturnPath}${safeReturnPath.includes("?") ? "&" : "?"}package_session_id={CHECKOUT_SESSION_ID}`
        : `${origin}/song/${orderId}?package_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: safeReturnPath ? `${origin}${safeReturnPath}` : `${origin}/song/${orderId}`,
      metadata,
      payment_intent_data: unitAmount > 0 ? { metadata } : undefined,
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Create package checkout error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
