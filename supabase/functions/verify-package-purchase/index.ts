import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { logActivity } from "../_shared/activity-log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionId } = await req.json();

    if (!sessionId || typeof sessionId !== "string") {
      return new Response(
        JSON.stringify({ error: "sessionId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const isFree = (session.amount_total ?? 0) === 0;
    const isPaid = session.payment_status === "paid" || (isFree && session.status === "complete");

    if (!isPaid) {
      return new Response(
        JSON.stringify({ error: "Payment not completed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const metadata = session.metadata || {};

    if (metadata.type !== "package_unlock" && metadata.entitlement !== "package_unlock") {
      return new Response(
        JSON.stringify({ error: "Invalid entitlement" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const orderId = metadata.orderId;
    if (!orderId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
      return new Response(
        JSON.stringify({ error: "Invalid order reference in session" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date().toISOString();
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
    const amount = session.amount_total ?? 0;

    // Idempotent: mark package unlocked only if not already
    const { error: pkgErr } = await supabase
      .from("orders")
      .update({
        package_unlocked_at: now,
        package_unlock_session_id: session.id,
        package_unlock_payment_intent_id: paymentIntentId,
        package_price_cents: amount,
      })
      .eq("id", orderId)
      .is("package_unlocked_at", null);

    if (pkgErr) {
      console.error("Failed to unlock package:", pkgErr);
      return new Response(
        JSON.stringify({ error: "Failed to unlock package" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Idempotently unlock the individual entitlements as bundled ($0 each because included)
    await supabase
      .from("orders")
      .update({ lyrics_unlocked_at: now, lyrics_price_cents: 0 })
      .eq("id", orderId)
      .is("lyrics_unlocked_at", null);

    await supabase
      .from("orders")
      .update({ download_unlocked_at: now, download_price_cents: 0 })
      .eq("id", orderId)
      .is("download_unlocked_at", null);

    await supabase
      .from("orders")
      .update({ bonus_unlocked_at: now, bonus_price_cents: 0 })
      .eq("id", orderId)
      .is("bonus_unlocked_at", null);

    await logActivity(
      supabase,
      "order",
      orderId,
      "package_unlocked",
      "system",
      `Forever Memory Package unlocked via Stripe, $${(amount / 100).toFixed(2)}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        package_unlocked_at: now,
        lyrics_unlocked: true,
        download_unlocked: true,
        bonus_unlocked: true,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Verify package purchase error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});