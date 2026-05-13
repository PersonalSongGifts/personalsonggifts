import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { logActivity } from "../_shared/activity-log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const adminPassword = req.headers.get("x-admin-password");
  if (!adminPassword || adminPassword !== Deno.env.get("ADMIN_PASSWORD")) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const { tipId } = await req.json();
    if (!tipId || typeof tipId !== "string") return json({ error: "tipId required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: tip, error: tipErr } = await supabase
      .from("song_tips")
      .select("id, order_id, amount_cents, status, refunded_at, stripe_payment_intent_id")
      .eq("id", tipId)
      .maybeSingle();
    if (tipErr) throw tipErr;
    if (!tip) return json({ error: "Tip not found" }, 404);
    if (tip.status !== "paid") return json({ error: "Tip is not paid" }, 400);
    if (tip.refunded_at) return json({ status: "already_refunded" });
    if (!tip.stripe_payment_intent_id) {
      return json({ error: "No payment intent on tip" }, 400);
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    try {
      await stripe.refunds.create({ payment_intent: tip.stripe_payment_intent_id });
    } catch (stripeErr) {
      // If already refunded in Stripe (charge_already_refunded), continue to flip our row
      const code = (stripeErr as { code?: string })?.code;
      if (code !== "charge_already_refunded") {
        console.error("Stripe refund failed:", stripeErr);
        return json(
          { error: stripeErr instanceof Error ? stripeErr.message : "Refund failed" },
          500,
        );
      }
    }

    // Idempotent: COALESCE so a webhook racing in won't overwrite
    const { error: updErr } = await supabase
      .from("song_tips")
      .update({
        refunded_at: tip.refunded_at ?? new Date().toISOString(),
        refunded_by: tip.refunded_at ? undefined : "admin",
      })
      .eq("id", tip.id);
    if (updErr) throw updErr;

    if (!tip.refunded_at) {
      await logActivity(
        supabase,
        "order",
        tip.order_id,
        "tip_refunded",
        "admin",
        `Tip of $${(tip.amount_cents / 100).toFixed(2)} refunded by admin`,
      );
    }

    return json({ status: "refunded" });
  } catch (e) {
    console.error("admin-refund-tip error:", e);
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
});