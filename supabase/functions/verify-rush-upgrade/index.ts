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
    if (metadata.type !== "rush_upgrade" && metadata.entitlement !== "rush_upgrade") {
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

    const { data: existing, error: loadErr } = await supabase
      .from("orders")
      .select("id, created_at, rush_addon, sent_at, delivery_status")
      .eq("id", orderId)
      .maybeSingle();

    if (loadErr || !existing) {
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const amount = session.amount_total ?? 0;

    if (existing.rush_addon) {
      return new Response(
        JSON.stringify({ rushApplied: true, alreadyRush: true, amountCents: amount }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const nowMs = Date.now();
    const createdMs = existing.created_at ? new Date(existing.created_at).getTime() : nowMs;
    const rushJitterMs = Math.floor(Math.random() * 15 * 60 * 1000);
    const targetSendMs = Math.max(createdMs + 30 * 60 * 1000 + rushJitterMs, nowMs + 5 * 60 * 1000);
    const targetSendIso = new Date(targetSendMs).toISOString();
    const expectedDeliveryIso = new Date(nowMs + 60 * 60 * 1000).toISOString();

    const update: Record<string, unknown> = {
      rush_addon: true,
      rush_price_cents: amount,
      expected_delivery: expectedDeliveryIso,
    };
    if (!existing.sent_at) {
      update.target_send_at = targetSendIso;
      if (!existing.delivery_status || existing.delivery_status === "pending") {
        update.delivery_status = "scheduled";
      }
    }

    const { error: rushErr } = await supabase
      .from("orders")
      .update(update)
      .eq("id", orderId)
      .eq("rush_addon", false);

    if (rushErr) {
      console.error("Failed to apply rush upgrade:", rushErr);
      return new Response(
        JSON.stringify({ error: "Failed to apply rush upgrade" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await logActivity(
      supabase,
      "order",
      orderId,
      "rush_upgrade_purchased",
      "system",
      `1-Hour Rush upgrade via Stripe, $${(amount / 100).toFixed(2)}`
    );

    return new Response(
      JSON.stringify({ rushApplied: true, amountCents: amount }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Verify rush upgrade error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});