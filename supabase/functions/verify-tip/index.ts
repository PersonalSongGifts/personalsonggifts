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
    if (session.payment_status !== "paid") {
      return new Response(
        JSON.stringify({ status: "pending" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const metadata = session.metadata || {};
    if (metadata.entitlement !== "song_tip") {
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const amountCents = session.amount_total ?? Number(metadata.amountCents) ?? 0;
    const customerEmail = session.customer_details?.email ?? null;
    const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : null;

    // Idempotent: only flip rows still pending
    const { data: updated, error: updateError } = await supabase
      .from("song_tips")
      .update({
        status: "paid",
        amount_cents: amountCents,
        stripe_payment_intent_id: paymentIntent,
        customer_email: customerEmail,
        paid_at: new Date().toISOString(),
      })
      .eq("stripe_session_id", session.id)
      .eq("status", "pending")
      .select("id");

    if (updateError) {
      console.error("Failed to mark tip paid:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to record tip" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (updated && updated.length > 0) {
      await logActivity(
        supabase,
        "order",
        orderId,
        "tip_received",
        "system",
        `Tip of $${(amountCents / 100).toFixed(2)} received`,
      );
    }

    return new Response(
      JSON.stringify({ status: "paid", amountCents }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("verify-tip error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});